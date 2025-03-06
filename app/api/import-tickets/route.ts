import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { Readable } from "stream";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Column mapping from Excel to database
const columnMapping: Record<string, string> = {
  "Ticket Id": "ticket_id",
  "Subject": "subject",
  "Description": "description",
  "Requester Email": "requester_email",
  "Requester Name": "requester_name",
  "Department": "department",
  "Group": "assigned_group",
  "Category": "category",
  "Sub-Category": "sub_category",
  "Priority": "priority",
  "Status": "status",
  "Resolution Note": "resolution_note",
  "Created Date": "created_at",
  "Resolved Date": "resolved_at"
};

// Function to parse date strings into proper format
function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch (error) {
    return null;
  }
}

// Function to convert Excel row to database record
function mapRowToRecord(row: Record<string, any>): Record<string, any> {
  const record: Record<string, any> = {};
  
  // Map each column according to the mapping
  for (const [excelCol, dbCol] of Object.entries(columnMapping)) {
    if (row[excelCol] !== undefined) {
      // Handle date fields
      if (dbCol === "created_at" || dbCol === "resolved_at") {
        record[dbCol] = parseDate(row[excelCol]);
      } else {
        record[dbCol] = row[excelCol]?.toString() || null;
      }
    }
  }
  
  // Ensure required fields are present
  if (!record.ticket_id || !record.subject || !record.requester_email) {
    throw new Error(`Missing required fields: ${!record.ticket_id ? 'Ticket Id, ' : ''}${!record.subject ? 'Subject, ' : ''}${!record.requester_email ? 'Requester Email' : ''}`);
  }
  
  return record;
}

// Function to process Excel file
async function processExcelFile(buffer: Buffer): Promise<any[]> {
  // Parse Excel file
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert to JSON with header row
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: "A" });
  
  // Extract header row and data rows
  const headerRow = rows[0] as Record<string, any>;
  const dataRows = rows.slice(1) as Record<string, any>[];
  
  // Create a mapping from column letter to column name
  const columnLetterToName: Record<string, string> = {};
  for (const [letter, name] of Object.entries(headerRow)) {
    if (typeof name === "string") {
      columnLetterToName[letter] = name;
    }
  }
  
  // Convert data rows to properly formatted objects
  return dataRows.map(row => {
    const formattedRow: Record<string, any> = {};
    for (const [letter, value] of Object.entries(row)) {
      const columnName = columnLetterToName[letter];
      if (columnName) {
        formattedRow[columnName] = value;
      }
    }
    return formattedRow;
  });
}

// Batch size for database inserts
const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  // Create a stream for sending progress updates
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // Process the request in the background and send updates through the stream
  processRequest(request, writer).catch(async (error) => {
    console.error("Error processing request:", error);
    await writer.write(
      encoder.encode(
        JSON.stringify({
          type: "error",
          message: error.message || "An unexpected error occurred",
        }) + "\n"
      )
    );
    await writer.close();
  });
  
  // Return the stream as the response
  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

const encoder = new TextEncoder();

async function processRequest(request: NextRequest, writer: WritableStreamDefaultWriter<Uint8Array>) {
  try {
    // Check if the request is multipart/form-data
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      throw new Error("Request must be multipart/form-data");
    }
    
    // Get the form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      throw new Error("No file provided");
    }
    
    // Check file type
    const fileType = file.type;
    if (
      fileType !== "application/vnd.ms-excel" &&
      fileType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      throw new Error("File must be an Excel file (.xls or .xlsx)");
    }
    
    // Convert file to buffer
    const buffer = await file.arrayBuffer();
    
    // Process the Excel file
    const rows = await processExcelFile(Buffer.from(buffer));
    
    // Initialize counters
    const total = rows.length;
    let processed = 0;
    let successful = 0;
    let failed = 0;
    
    // Send initial progress update
    await writer.write(
      encoder.encode(
        JSON.stringify({
          type: "progress",
          total,
          processed,
          successful,
          failed,
          percentage: 0,
        }) + "\n"
      )
    );
    
    // Process rows in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchRecords = [];
      const batchErrors = [];
      
      // Map each row to a database record
      for (const row of batch) {
        try {
          const record = mapRowToRecord(row);
          batchRecords.push(record);
        } catch (error: any) {
          batchErrors.push({
            row: i + batch.indexOf(row) + 1,
            error: error.message,
          });
          failed++;
        }
      }
      
      // Insert valid records into the database
      if (batchRecords.length > 0) {
        const { data, error } = await supabase
          .from("ticket_history")
          .insert(batchRecords)
          .select();
        
        if (error) {
          console.error("Database error:", error);
          failed += batchRecords.length;
        } else {
          successful += data?.length || 0;
          failed += batchRecords.length - (data?.length || 0);
        }
      }
      
      // Update processed count
      processed += batch.length;
      
      // Send progress update
      await writer.write(
        encoder.encode(
          JSON.stringify({
            type: "progress",
            total,
            processed,
            successful,
            failed,
            percentage: Math.round((processed / total) * 100),
          }) + "\n"
        )
      );
      
      // Small delay to prevent overwhelming the client
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Send completion update
    await writer.write(
      encoder.encode(
        JSON.stringify({
          type: "complete",
          total,
          successful,
          failed,
        }) + "\n"
      )
    );
    
    // Close the writer
    await writer.close();
  } catch (error: any) {
    console.error("Error processing request:", error);
    await writer.write(
      encoder.encode(
        JSON.stringify({
          type: "error",
          message: error.message || "An unexpected error occurred",
        }) + "\n"
      )
    );
    await writer.close();
  }
} 
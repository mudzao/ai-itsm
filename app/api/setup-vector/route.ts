import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    // Step 1: Create vector extension
    console.log("Step 1: Creating vector extension...");
    try {
      const { data: extensionData, error: extensionError } = await supabase.rpc('create_vector_extension');
      if (extensionError) {
        console.error("Error creating vector extension:", extensionError);
      } else {
        console.log("Vector extension created or already exists");
      }
    } catch (err) {
      console.error("Failed to create vector extension:", err);
      // Continue anyway, as it might already exist
    }

    // Step 2: Add embedding column to ticket_history table
    console.log("Step 2: Adding embedding column...");
    try {
      // First check if the table exists
      const { count, error: tableCheckError } = await supabase
        .from('ticket_history')
        .select('*', { count: 'exact', head: true });
        
      if (tableCheckError) {
        console.error("Error checking ticket_history table:", tableCheckError);
        return NextResponse.json({ 
          error: "Ticket history table not accessible",
          message: tableCheckError.message
        }, { status: 500 });
      }
      
      if (count === 0) {
        console.log("Ticket_history table exists but is empty");
      }
      
      // Try to add the embedding column directly with SQL
      const { error: alterTableError } = await supabase.rpc('add_embedding_column');
      
      if (alterTableError) {
        console.error("Error adding embedding column:", alterTableError);
        return NextResponse.json({ 
          error: "Failed to add embedding column",
          message: alterTableError.message
        }, { status: 500 });
      }
      
      console.log("Embedding column added successfully");
      
      return NextResponse.json({ 
        success: true,
        message: "Vector extension and embedding column set up successfully"
      });
    } catch (err: any) {
      console.error("Error in setup process:", err);
      return NextResponse.json({ 
        error: "Setup failed",
        message: err.message
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("General error:", error);
    return NextResponse.json({ 
      error: "Setup failed",
      message: error.message
    }, { status: 500 });
  }
} 
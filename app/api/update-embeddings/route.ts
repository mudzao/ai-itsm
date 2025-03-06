import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to generate embedding using OpenAI
async function generateEmbedding(text: string) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

// Main API handler
export async function POST(request: NextRequest) {
  try {
    // Check if pgvector extension is enabled
    const { error: extensionError } = await supabase.rpc('check_vector_extension');
    
    if (extensionError) {
      // If extension doesn't exist, create it
      await supabase.rpc('create_vector_extension');
    }

    // Check if embedding column exists
    const { error: columnError } = await supabase.rpc('check_embedding_column');
    
    if (columnError) {
      // If column doesn't exist, create it
      await supabase.rpc('add_embedding_column');
    }

    // Get tickets without embeddings
    const { data: tickets, error: fetchError } = await supabase
      .from('ticket_history')
      .select('id, subject, description')
      .is('embedding', null)
      .limit(50); // Process in batches

    if (fetchError) {
      throw new Error(`Failed to fetch tickets: ${fetchError.message}`);
    }

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ message: "No tickets found that need embeddings" });
    }

    // Process each ticket
    const results = [];
    for (const ticket of tickets) {
      try {
        // Combine subject and description for embedding
        const text = `${ticket.subject} ${ticket.description || ""}`.trim();
        const embedding = await generateEmbedding(text);

        // Update the ticket with the embedding
        const { error: updateError } = await supabase
          .from('ticket_history')
          .update({ embedding })
          .eq('id', ticket.id);

        if (updateError) {
          results.push({
            id: ticket.id,
            success: false,
            error: updateError.message
          });
        } else {
          results.push({
            id: ticket.id,
            success: true
          });
        }
      } catch (error) {
        results.push({
          id: ticket.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    // Return results
    return NextResponse.json({
      processed: tickets.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    console.error("Error updating embeddings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update embeddings" },
      { status: 500 }
    );
  }
}

// GET endpoint to check status
export async function GET(request: NextRequest) {
  try {
    // Check if the embedding column exists
    try {
      const { data: columnCheck, error: columnError } = await supabase.rpc('check_embedding_column');
      
      if (columnError || !columnCheck) {
        return NextResponse.json({ 
          error: "Embedding column does not exist. Please run the SQL script first.",
          message: columnError?.message || "Column check failed"
        }, { status: 500 });
      }
    } catch (err: any) {
      console.error("Error checking embedding column:", err);
      return NextResponse.json({ 
        error: "Failed to check embedding column",
        message: err.message
      }, { status: 500 });
    }
    
    // Get tickets without embeddings
    const { data: tickets, error: ticketsError } = await supabase
      .from('ticket_history')
      .select('id, subject, description')
      .is('embedding', null)
      .limit(10); // Process in batches of 10
    
    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError);
      return NextResponse.json({ 
        error: "Failed to fetch tickets",
        message: ticketsError.message
      }, { status: 500 });
    }
    
    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: "No tickets found without embeddings"
      });
    }
    
    console.log(`Found ${tickets.length} tickets without embeddings`);
    
    // Generate and update embeddings
    const results = [];
    
    for (const ticket of tickets) {
      try {
        // Combine subject and description for embedding
        const text = `${ticket.subject} ${ticket.description || ""}`.trim();
        const embedding = await generateEmbedding(text);
        
        // Update the ticket with the embedding
        const { error: updateError } = await supabase
          .from('ticket_history')
          .update({ embedding })
          .eq('id', ticket.id);
        
        if (updateError) {
          console.error(`Error updating ticket ${ticket.id}:`, updateError);
          results.push({
            id: ticket.id,
            success: false,
            error: updateError.message
          });
        } else {
          console.log(`Updated embedding for ticket ${ticket.id}`);
          results.push({
            id: ticket.id,
            success: true
          });
        }
      } catch (err: any) {
        console.error(`Error processing ticket ${ticket.id}:`, err);
        results.push({
          id: ticket.id,
          success: false,
          error: err.message
        });
      }
    }
    
    return NextResponse.json({ 
      success: true,
      processed: tickets.length,
      results,
      message: "Embeddings update process completed"
    });
  } catch (error: any) {
    console.error("General error:", error);
    return NextResponse.json({ 
      error: "Embeddings update failed",
      message: error.message
    }, { status: 500 });
  }
} 
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

// Define support groups and their responsibilities
const supportGroups = [
  {
    name: "Network Operations",
    responsibilities: "Handle network connectivity issues, VPN problems, internet outages, firewall configurations, and network hardware troubleshooting.",
    examples: [
      "Cannot connect to VPN from home office",
      "Internet connection is very slow in the marketing department",
      "Unable to access network drives after moving to a new office",
      "Firewall is blocking access to required business applications"
    ]
  },
  {
    name: "Desktop Support",
    responsibilities: "Manage hardware issues, software installations, operating system problems, and peripheral device setup.",
    examples: [
      "My laptop won't turn on",
      "Need Microsoft Office installed on my new computer",
      "Blue screen error when starting Windows",
      "Cannot connect my monitor to the docking station"
    ]
  },
  {
    name: "Application Support",
    responsibilities: "Resolve issues with business applications, software bugs, application access problems, and feature requests.",
    examples: [
      "Cannot log into the CRM system",
      "Excel crashes when opening large spreadsheets",
      "Need access to the accounting software",
      "The reporting dashboard shows incorrect data"
    ]
  },
  {
    name: "Email & Collaboration",
    responsibilities: "Support email services, calendar functions, video conferencing tools, and collaboration platforms.",
    examples: [
      "Not receiving emails from external senders",
      "Cannot schedule meetings in Outlook",
      "Teams call quality is poor during meetings",
      "Need to set up an email distribution list"
    ]
  },
  {
    name: "Security",
    responsibilities: "Address security incidents, suspicious activities, access control issues, and security policy compliance.",
    examples: [
      "Received a suspicious phishing email",
      "Need to reset multi-factor authentication",
      "Concerned about potential malware on my computer",
      "Request for temporary elevated permissions"
    ]
  },
  {
    name: "Database Administration",
    responsibilities: "Manage database performance issues, data access problems, query optimization, and database maintenance.",
    examples: [
      "Database server is running slowly",
      "Need access to the customer database",
      "Error when running SQL queries against the production database",
      "Database backup failed last night"
    ]
  },
  {
    name: "Server Operations",
    responsibilities: "Handle server hardware issues, operating system problems, virtualization, and server maintenance.",
    examples: [
      "Production web server is down",
      "Need additional storage on the file server",
      "Server performance degradation after recent updates",
      "Virtual machine not starting properly"
    ]
  }
];

// Function to generate system prompt for OpenAI
function generateSystemPrompt() {
  let prompt = `You are a ticket classification assistant for an IT helpdesk. Your task is to analyze the subject and description of a support ticket and determine which support group should handle it.

Here are the support groups and their responsibilities:

`;

  // Add support groups and responsibilities to the prompt
  supportGroups.forEach(group => {
    prompt += `${group.name}: ${group.responsibilities}\n`;
  });

  prompt += `\nFor each support group, here are some example tickets they would handle:\n`;

  // Add examples for each group
  supportGroups.forEach(group => {
    prompt += `\n${group.name} examples:\n`;
    group.examples.forEach(example => {
      prompt += `- ${example}\n`;
    });
  });

  prompt += `\nAnalyze the ticket details and provide:
1. The most appropriate support group
2. A confidence score (0-100%)
3. Brief reasoning for your classification
4. Two alternative support groups that might also be appropriate (with lower confidence)

Format your response as a JSON object with the following structure:
{
  "primaryGroup": {
    "name": "Support Group Name",
    "confidence": 85,
    "reasoning": "Brief explanation of why this group is most appropriate"
  },
  "alternativeGroups": [
    {
      "name": "Alternative Group 1",
      "confidence": 60,
      "reasoning": "Why this could also be appropriate"
    },
    {
      "name": "Alternative Group 2",
      "confidence": 40,
      "reasoning": "Why this might be considered"
    }
  ]
}`;

  return prompt;
}

// Function to classify ticket using OpenAI
async function classifyWithOpenAI(subject: string, description: string) {
  try {
    const systemPrompt = generateSystemPrompt();
    const userPrompt = `Ticket Subject: ${subject}\n\nTicket Description: ${description || "No description provided"}`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    try {
      // Parse the JSON response
      return JSON.parse(content);
    } catch (error) {
      console.error("Failed to parse OpenAI response:", content);
      throw new Error("Failed to parse classification response");
    }
  } catch (error) {
    console.error("OpenAI classification error:", error);
    throw error;
  }
}

// Function to generate embeddings for text
async function generateEmbedding(text: string) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

// Function to find similar tickets using vector similarity
async function findSimilarTickets(subject: string, description: string) {
  try {
    // For testing purposes, let's check if the ticket_history table exists first
    const { count, error: tableCheckError } = await supabase
      .from('ticket_history')
      .select('*', { count: 'exact', head: true });
      
    if (tableCheckError) {
      console.error("Error checking ticket_history table:", tableCheckError);
      return { 
        success: false, 
        error: "Ticket history table not accessible", 
        results: [],
        similarTickets: [] 
      };
    }
    
    if (count === 0) {
      console.log("No tickets in the ticket_history table. Using pattern-based classification only.");
      return { 
        success: false, 
        error: "No historical tickets available", 
        results: [],
        similarTickets: [] 
      };
    }
    
    // Check if pgvector extension is enabled
    const { error: extensionError } = await supabase.rpc('check_vector_extension');
    
    if (extensionError) {
      console.log("Vector extension not available, creating it...");
      try {
        await supabase.rpc('create_vector_extension');
      } catch (err) {
        console.error("Failed to create vector extension:", err);
        return { success: false, error: "Vector extension not available", results: [], similarTickets: [] };
      }
    }

    // Check if embedding column exists
    const { error: columnError } = await supabase.rpc('check_embedding_column');
    
    if (columnError) {
      console.log("Embedding column not found, attempting to create it...");
      try {
        await supabase.rpc('add_embedding_column');
      } catch (err) {
        console.error("Failed to add embedding column:", err);
        return { success: false, error: "Embedding column could not be created", results: [], similarTickets: [] };
      }
    }

    // For testing purposes, check if there are any tickets with embeddings
    const { data: embeddingCheck, error: checkError } = await supabase
      .from('ticket_history')
      .select('id')
      .not('embedding', 'is', null)
      .limit(1);
      
    if (checkError) {
      console.error("Error checking for embeddings:", checkError);
      return { success: false, error: "Could not check for embeddings", results: [], similarTickets: [] };
    }
    
    if (!embeddingCheck || embeddingCheck.length === 0) {
      console.log("No tickets with embeddings found. Using pattern-based classification only.");
      return { success: false, error: "No tickets with embeddings", results: [], similarTickets: [] };
    }

    // Combine subject and description for embedding
    const text = `${subject} ${description || ""}`.trim();
    const embedding = await generateEmbedding(text);

    // Query similar tickets
    try {
      const { data: similarTickets, error } = await supabase.rpc('match_tickets', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 5
      });

      if (error) {
        console.error("Error finding similar tickets:", error);
        return { success: false, error: error.message, results: [], similarTickets: [] };
      }

      // Count occurrences of each support group
      const groupCounts: Record<string, number> = {};
      let totalMatches = 0;

      similarTickets.forEach((ticket: any) => {
        if (ticket.assigned_group) {
          groupCounts[ticket.assigned_group] = (groupCounts[ticket.assigned_group] || 0) + 1;
          totalMatches++;
        }
      });

      // Calculate confidence for each group
      const groupConfidence: Array<{name: string, confidence: number, count: number}> = [];
      
      for (const [group, count] of Object.entries(groupCounts)) {
        groupConfidence.push({
          name: group,
          confidence: Math.round((count / totalMatches) * 100),
          count
        });
      }

      // Sort by confidence (highest first)
      groupConfidence.sort((a, b) => b.confidence - a.confidence);

      return { success: true, results: groupConfidence, similarTickets };
    } catch (rpcError) {
      console.error("Vector similarity error:", rpcError);
      return { success: false, error: "Vector similarity search failed", results: [], similarTickets: [] };
    }
  } catch (error) {
    console.error("Error in findSimilarTickets:", error);
    return { 
      success: false, 
      error: "General error in vector similarity search", 
      results: [],
      similarTickets: [] 
    };
  }
}

// Main API handler
export async function POST(request: NextRequest) {
  try {
    const { subject, description } = await request.json();
    
    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }
    
    // Step 1: Classify using OpenAI (pattern-based)
    const openAIClassification = await classifyWithOpenAI(subject, description || "");
    
    // Step 2: Find similar tickets using vector similarity
    const vectorResults = await findSimilarTickets(subject, description || "");
    
    console.log("Vector similarity results:", 
      vectorResults.success 
        ? `Found ${vectorResults.results.length} group recommendations` 
        : `Failed: ${vectorResults.error}`
    );
    
    // Step 3: Combine results
    const response = {
      patternBasedClassification: openAIClassification,
      vectorSimilarityClassification: {
        recommendations: vectorResults.results || [],
        similarTicketsCount: vectorResults.similarTickets?.length || 0,
        confidence: vectorResults.results && vectorResults.results.length > 0 && 'confidence' in vectorResults.results[0]
          ? (vectorResults.results[0] as {name: string, confidence: number, count: number}).confidence
          : 0,
        success: vectorResults.success,
        error: vectorResults.error
      },
      // Determine final recommendation based on both approaches
      finalRecommendation: determineFinalRecommendation(
        openAIClassification,
        vectorResults.results as Array<{name: string, confidence: number, count: number}> || []
      )
    };
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error classifying ticket:", error);
    return NextResponse.json(
      { error: "Failed to classify ticket: " + error.message },
      { status: 500 }
    );
  }
}

// Function to determine final recommendation by combining both approaches
function determineFinalRecommendation(
  openAIResult: any,
  vectorResults: Array<{name: string, confidence: number, count: number}>
) {
  // If we have no vector results, use OpenAI classification
  if (vectorResults.length === 0) {
    return {
      group: openAIResult.primaryGroup.name,
      confidence: openAIResult.primaryGroup.confidence,
      source: "pattern-based",
      reasoning: openAIResult.primaryGroup.reasoning
    };
  }

  // If we have both, look for agreement
  const openAIPrimary = openAIResult.primaryGroup.name;
  const vectorPrimary = vectorResults[0].name;
  
  // Check if the top recommendation from both methods is the same
  if (openAIPrimary === vectorPrimary) {
    // Average the confidence scores, with more weight to historical data
    const combinedConfidence = Math.round(
      (openAIResult.primaryGroup.confidence * 0.4) + 
      (vectorResults[0].confidence * 0.6)
    );
    
    return {
      group: openAIPrimary,
      confidence: combinedConfidence,
      source: "combined",
      reasoning: `Both pattern analysis and historical data agree on this group. Based on ${vectorResults[0].count} similar historical tickets.`
    };
  }
  
  // If there's disagreement, check if OpenAI's primary is in vector results
  const matchingVectorResult = vectorResults.find(r => r.name === openAIPrimary);
  
  if (matchingVectorResult) {
    // OpenAI's suggestion exists in vector results but isn't the top one
    return {
      group: openAIPrimary,
      confidence: Math.round((openAIResult.primaryGroup.confidence * 0.7) + (matchingVectorResult.confidence * 0.3)),
      source: "pattern-weighted",
      reasoning: `Pattern analysis suggests this group, with some support from historical data (${matchingVectorResult.count} similar tickets).`
    };
  }
  
  // If vector has strong confidence but OpenAI disagrees
  if (vectorResults[0].confidence > 70) {
    return {
      group: vectorPrimary,
      confidence: vectorResults[0].confidence,
      source: "history-weighted",
      reasoning: `Based primarily on ${vectorResults[0].count} similar historical tickets that were assigned to this group.`
    };
  }
  
  // Default to OpenAI with reduced confidence
  return {
    group: openAIPrimary,
    confidence: Math.min(openAIResult.primaryGroup.confidence, 70), // Cap confidence at 70%
    source: "pattern-based",
    reasoning: openAIResult.primaryGroup.reasoning + " (Note: Historical data suggests different groups.)"
  };
} 
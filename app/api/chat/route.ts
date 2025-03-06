import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { searchFAQ } from "@/lib/supabase";

// Check if OpenAI API key is set
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn("Warning: OPENAI_API_KEY is not set in environment variables");
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: apiKey || "",
});

// Testing mode flag - set to false to enable FAQ lookup
const TESTING_MODE = false;

// Store conversation history in memory (this will reset on server restart)
// In a production app, you would use a database
type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

// Store conversations by session ID
const conversations: Record<string, Message[]> = {};

// Function to detect language and translate to English if needed
async function translateToEnglishIfNeeded(message: string): Promise<{ translatedText: string, wasTranslated: boolean, originalLanguage: string }> {
  try {
    console.log("Detecting language and translating if needed...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a language detection and translation assistant. First detect the language of the text. If it's not English, translate it to English. If it's already English, just return the original text. Respond in the format: {\"language\": \"detected language\", \"translation\": \"English translation or original if already English\", \"isEnglish\": true/false}"
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.3,
    });

    const content = response.choices[0].message.content?.trim() || "";
    
    try {
      const parsedResponse = JSON.parse(content);
      const isEnglish = parsedResponse.isEnglish;
      const detectedLanguage = parsedResponse.language;
      const translation = parsedResponse.translation;
      
      console.log(`Language detected: ${detectedLanguage}, Is English: ${isEnglish}`);
      
      if (!isEnglish) {
        console.log(`Translated from ${detectedLanguage}: "${message}" -> "${translation}"`);
        return { 
          translatedText: translation, 
          wasTranslated: true, 
          originalLanguage: detectedLanguage 
        };
      } else {
        return { 
          translatedText: message, 
          wasTranslated: false, 
          originalLanguage: "English" 
        };
      }
    } catch (parseError) {
      console.error("Error parsing translation response:", parseError);
      return { 
        translatedText: message, 
        wasTranslated: false, 
        originalLanguage: "Unknown" 
      };
    }
  } catch (error) {
    console.error("Translation error:", error);
    return { 
      translatedText: message, 
      wasTranslated: false, 
      originalLanguage: "Unknown" 
    };
  }
}

/**
 * Use OpenAI to rephrase an FAQ answer in a more conversational tone
 */
async function rephraseWithOpenAI(faqAnswer: string, userQuestion: string, originalLanguage: string = "English"): Promise<string> {
  try {
    console.log("Rephrasing FAQ answer with OpenAI...");
    
    let rephrasePrompt = `Rephrase the following FAQ answer to sound more conversational and friendly, while maintaining all the important information. Make it sound like a helpful assistant responding directly to the user's question.`;
    
    // If the original query was not in English, translate the response back
    if (originalLanguage.toLowerCase() !== "english" && originalLanguage !== "unknown") {
      rephrasePrompt += ` Then translate the response to ${originalLanguage}.`;
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: rephrasePrompt
        },
        {
          role: "user",
          content: `User question: ${userQuestion}\nFAQ answer: ${faqAnswer}`
        }
      ],
      temperature: 0.7,
    });

    return response.choices[0].message.content?.trim() || faqAnswer;
  } catch (error) {
    console.error("Error rephrasing with OpenAI:", error);
    return faqAnswer; // Fallback to original answer if rephrasing fails
  }
}

// Function to classify a message as a potential support ticket
async function classifyTicket(message: string) {
  try {
    // Fix URL construction for server-side API calls
    // When calling from server to server, we need to use absolute URL if external
    // or relative URL if same-origin
    let url = '/api/classify-ticket';
    
    // If we're in a production environment and NEXT_PUBLIC_BASE_URL is set,
    // use it to construct an absolute URL
    if (process.env.NEXT_PUBLIC_BASE_URL) {
      url = `${process.env.NEXT_PUBLIC_BASE_URL}${url}`;
    } else if (process.env.VERCEL_URL) {
      // Fallback for Vercel deployments
      url = `https://${process.env.VERCEL_URL}${url}`;
    }
    
    console.log(`Calling classification API at: ${url}`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: message,
        description: "" // Using just the message as the subject for classification
      }),
    });

    if (!response.ok) {
      throw new Error(`Classification failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error classifying ticket:", error);
    return null;
  }
}

// Function to determine if a message is likely a support ticket
function isLikelyTicket(message: string): boolean {
  // Check for common ticket-related phrases
  const ticketPhrases = [
    "not working", "broken", "issue", "problem", "error", "help", 
    "can't access", "doesn't work", "failed", "trouble", "unable to",
    "need assistance", "support", "ticket", "request"
  ];

  const lowerMessage = message.toLowerCase();
  
  // Check if any of the phrases are in the message
  return ticketPhrases.some(phrase => lowerMessage.includes(phrase));
}

// Function to check if a message is a simple conversational phrase
function isConversationalPhrase(message: string): boolean {
  // Common conversational phrases and greetings
  const conversationalPhrases = [
    // Greetings
    "hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening", "yo",
    // Questions about well-being
    "how are you", "how's it going", "how are things", "what's up", "how do you do","how r u",
    // Farewells
    "goodbye", "bye", "see you", "talk to you later", "have a good day",
    // Gratitude
    "thank you", "thanks", "appreciate it", "thank you very much",
    // Simple acknowledgments
    "okay", "ok", "sure", "alright", "got it",
    // Politeness
    "please", "excuse me", "pardon me"
  ];

  const lowerMessage = message.toLowerCase().trim();
  
  // Check for exact matches first (for very short messages)
  if (conversationalPhrases.includes(lowerMessage)) {
    return true;
  }
  
  // For longer messages, check if they primarily consist of conversational phrases
  // This helps identify messages like "Hello, how are you today?"
  return conversationalPhrases.some(phrase => 
    lowerMessage.includes(phrase) && lowerMessage.length < phrase.length + 15
  );
}

// Function to generate a response for conversational phrases
function getConversationalResponse(message: string): string {
  const lowerMessage = message.toLowerCase().trim();
  
  // Greeting responses
  if (lowerMessage.includes("hello") || lowerMessage.includes("hi") || 
      lowerMessage.includes("hey") || lowerMessage.includes("greetings")) {
    return "Hello! How can I assist you with IT support today?";
  }
  
  // Well-being questions
  if (lowerMessage.includes("how are you") || lowerMessage.includes("how's it going") || 
      lowerMessage.includes("what's up")) {
    return "I'm doing well, thank you for asking! I'm ready to help with any IT questions or issues you might have.";
  }
  
  // Farewell responses
  if (lowerMessage.includes("goodbye") || lowerMessage.includes("bye") || 
      lowerMessage.includes("see you") || lowerMessage.includes("talk to you later")) {
    return "Goodbye! Feel free to reach out if you need IT support in the future.";
  }
  
  // Gratitude responses
  if (lowerMessage.includes("thank you") || lowerMessage.includes("thanks") || 
      lowerMessage.includes("appreciate")) {
    return "You're welcome! I'm happy to help. Is there anything else you need assistance with?";
  }
  
  // Default response for other conversational phrases
  return "I'm here to help with your IT support needs. What can I assist you with today?";
}

// Function to format support group suggestions
function formatSupportGroupSuggestions(classification: any): string {
  // Return empty string since we're displaying classification in the UI component
  return "";
  
  /* Original implementation - commented out
  if (!classification || !classification.finalRecommendation) {
    return "";
  }

  const { group, confidence, reasoning } = classification.finalRecommendation;
  
  // Only include suggestions if confidence is above a threshold
  if (confidence < 50) {
    return "";
  }

  let suggestions = `\n\n**Support Group Suggestion**: ${group} (${confidence}% confidence)`;
  
  // Add alternative groups if available
  if (classification.patternBasedClassification?.alternativeGroups?.length > 0) {
    const alternatives = classification.patternBasedClassification.alternativeGroups
      .filter((alt: any) => alt.confidence > 30)
      .map((alt: any) => `${alt.name} (${alt.confidence}%)`);
    
    if (alternatives.length > 0) {
      suggestions += `\n**Alternative Groups**: ${alternatives.join(", ")}`;
    }
  }
  
  return suggestions;
  */
}

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId } = await request.json();
    
    console.log(`User message: ${message}`);
    
    // Get or initialize conversation history
    if (!conversations[sessionId]) {
      // Initialize with a system message to set the context
      conversations[sessionId] = [
        {
          role: "system",
          content: "You are an L1 Helpdesk assistant. Be helpful, clear, and concise when answering IT support questions.",
        },
      ];
    }
    
    // Translate message if it's not in English
    const { translatedText, wasTranslated, originalLanguage } = await translateToEnglishIfNeeded(message);
    
    // Check if the message is a simple conversational phrase
    if (isConversationalPhrase(translatedText)) {
      console.log("Detected conversational phrase, providing direct response");
      
      // Get appropriate response for the conversational phrase
      const conversationalResponse = getConversationalResponse(translatedText);
      
      // Add user message to conversation history
      conversations[sessionId].push({
        role: "user",
        content: message, // Use original message to maintain language context
      });
      
      // Add assistant response to conversation history
      conversations[sessionId].push({
        role: "assistant",
        content: conversationalResponse,
      });
      
      // Keep conversation history to a reasonable size
      if (conversations[sessionId].length > 11) {
        conversations[sessionId] = [conversations[sessionId][0], ...conversations[sessionId].slice(conversations[sessionId].length - 10)];
      }
      
      return NextResponse.json({
        reply: conversationalResponse,
        source: "conversational",
      });
    }
    
    if (TESTING_MODE) {
      // TESTING MODE: Skip FAQ lookup and go directly to ticket classification
      console.log("TESTING MODE: Skipping FAQ lookup and going directly to ticket classification");
    } else {
      // NORMAL MODE: Try to find a matching FAQ first
      console.log("Searching for matching FAQ...");
      const faqMatch = await searchFAQ(translatedText);
      
      if (faqMatch) {
        console.log("FAQ match found:", faqMatch.question);
        
        // Rephrase the answer to be more conversational
        const rephrased = await rephraseWithOpenAI(faqMatch.answer, translatedText, originalLanguage);
        
        // Add user message to conversation history
        conversations[sessionId].push({
          role: "user",
          content: message, // Use original message to maintain language context
        });
        
        // Add assistant response to conversation history
        conversations[sessionId].push({
          role: "assistant",
          content: rephrased,
        });
        
        // Keep conversation history to a reasonable size
        if (conversations[sessionId].length > 11) {
          conversations[sessionId] = [conversations[sessionId][0], ...conversations[sessionId].slice(conversations[sessionId].length - 10)];
        }
        
        return NextResponse.json({
          reply: rephrased,
          source: "faq",
          faqId: faqMatch.id,
        });
      } else {
        console.log("No FAQ match found, proceeding to ticket classification");
      }
    }
    
    // Check if the message is likely a support ticket
    let supportGroupSuggestions = "";
    let ticketClassification = null;
    
    console.log("Attempting to classify as a ticket...");
    ticketClassification = await classifyTicket(translatedText);
    
    if (ticketClassification) {
      console.log("Ticket classification successful:", JSON.stringify(ticketClassification.finalRecommendation));
      supportGroupSuggestions = formatSupportGroupSuggestions(ticketClassification);
    } else {
      console.log("Ticket classification returned null");
    }
    
    // Add user message to conversation history
    conversations[sessionId].push({
      role: "user",
      content: message, // Use original message to maintain language context
    });
    
    // Keep conversation history to a reasonable size (last 10 messages)
    if (conversations[sessionId].length > 11) { // 1 system message + 10 conversation messages
      conversations[sessionId] = [conversations[sessionId][0], ...conversations[sessionId].slice(conversations[sessionId].length - 10)];
    }
    
    // Call OpenAI API
    console.log("Calling OpenAI API...");
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: conversations[sessionId],
      temperature: 0.7,
    });
    
    console.log("OpenAI response received");
    let reply = completion.choices[0].message.content || "Sorry, I couldn't generate a response.";
    
    // Add support group suggestions if available
    if (supportGroupSuggestions) {
      reply += supportGroupSuggestions;
    }
    
    // Add assistant response to conversation history
    conversations[sessionId].push({
      role: "assistant",
      content: reply,
    });
    
    // Prepare ticket classification response with alternative groups
    let enhancedClassification = null;
    if (ticketClassification?.finalRecommendation) {
      enhancedClassification = {
        ...ticketClassification.finalRecommendation,
        alternativeGroups: ticketClassification.patternBasedClassification?.alternativeGroups || []
      };
    }
    
    return NextResponse.json({ 
      reply, 
      source: "ai",
      ticketClassification: enhancedClassification
    });
  } catch (error: any) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Failed to process your request: " + error.message },
      { status: 500 }
    );
  }
} 
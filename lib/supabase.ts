import { createClient } from '@supabase/supabase-js';

// Check if Supabase credentials are set
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Warning: Supabase credentials are not set in environment variables');
}

// Create a single supabase client for interacting with your database
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

// Type definition for FAQ items
export type FAQ = {
  id: number;
  question: string;
  answer: string;
  created_at?: string;
};

/**
 * Search for a FAQ that matches the query
 * @param query The user's question
 * @returns The matching FAQ or null if no match is found
 */
export async function searchFAQ(query: string): Promise<FAQ | null> {
  try {
    // Normalize the query (lowercase, remove extra spaces)
    const normalizedQuery = query.toLowerCase().trim();
    
    // First try an exact match with ILIKE
    const { data: exactMatches, error: exactError } = await supabase
      .from('faqs')
      .select('*')
      .ilike('question', `%${normalizedQuery}%`)
      .limit(1);
    
    if (exactError) {
      console.error('Error searching for exact FAQ match:', exactError);
      return null;
    }
    
    if (exactMatches && exactMatches.length > 0) {
      console.log(`Exact match found for: "${normalizedQuery}"`);
      return exactMatches[0] as FAQ;
    }
    
    // If no exact match, try a fuzzy search using PostgreSQL's similarity function
    // Note: This requires the pg_trgm extension to be enabled in your Supabase project
    try {
      const { data: fuzzyMatches, error: fuzzyError } = await supabase
        .rpc('search_faqs', { query_text: normalizedQuery })
        .limit(5); // Get top 5 matches to check similarity
      
      if (fuzzyError) {
        console.error('Error searching for fuzzy FAQ match:', fuzzyError);
        return null;
      }
      
      if (fuzzyMatches && fuzzyMatches.length > 0) {
        // Check if the top match has a good similarity score
        // We can do this by comparing the normalized query with the question
        const topMatch = fuzzyMatches[0] as FAQ;
        const normalizedQuestion = topMatch.question.toLowerCase().trim();
        
        // Calculate a simple similarity score (number of matching words / total words)
        const queryWords = normalizedQuery.split(/\s+/);
        const questionWords = normalizedQuestion.split(/\s+/);
        
        // Count matching words
        const matchingWords = queryWords.filter(word => 
          questionWords.some(qWord => qWord.includes(word) || word.includes(qWord))
        );
        
        const similarityScore = matchingWords.length / Math.max(queryWords.length, questionWords.length);
        
        console.log(`Fuzzy match: "${normalizedQuery}" -> "${normalizedQuestion}"`);
        console.log(`Similarity score: ${similarityScore}`);
        
        // Only return the match if the similarity score is above a threshold
        if (similarityScore >= 0.5) {
          return topMatch;
        } else {
          console.log(`Similarity score too low (${similarityScore}), no match returned`);
        }
      }
    } catch (fuzzyError) {
      console.error('Error in fuzzy search:', fuzzyError);
      // If the RPC function doesn't exist or fails, we'll just return null
    }
    
    // No match found
    console.log(`No FAQ match found for: "${normalizedQuery}"`);
    return null;
  } catch (error) {
    console.error('Error searching for FAQ:', error);
    return null;
  }
} 
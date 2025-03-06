# AI-Powered L1 Helpdesk Chatbot

A modern, responsive chatbot interface built with Next.js, React, and shadcn/ui components. This chatbot uses Supabase for FAQ storage and retrieval, with OpenAI's GPT API as a fallback for questions not found in the FAQ database.

## Features

- Clean, modern UI with responsive design
- Real-time chat interface with typing indicators
- Supabase integration for FAQ storage and retrieval
  - Exact matching for precise questions
  - Fuzzy search with similarity threshold for flexible matching
  - Conversational rephrasing of FAQ answers for a more natural interaction
- Multilingual support
  - Automatic language detection
  - Translation of non-English queries for FAQ matching
  - Response translation back to the original language
- OpenAI GPT API integration for handling questions not in the FAQ database
- Ticket classification system
  - Pattern-based classification using OpenAI
  - Vector similarity search using historical tickets
  - Support group suggestions with confidence scores
  - Automatic embedding generation for historical tickets
- Ticket history import system
  - Excel file upload with drag-and-drop
  - Real-time progress tracking
  - Batch processing to handle large files
- Session-based conversation history
- Error handling with user-friendly messages
- Dark mode support

## Tech Stack

- **Frontend**: React with Next.js (App Router)
- **UI Components**: shadcn/ui
- **Styling**: TailwindCSS
- **API**: Next.js API Routes
- **Database**: Supabase (PostgreSQL) for FAQ storage and ticket history
- **Vector Search**: pgvector extension for similarity search
- **AI**: OpenAI GPT API (gpt-3.5-turbo) and Embeddings API
- **File Processing**: xlsx for Excel parsing

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key
- Supabase account and project
- PostgreSQL with pgvector extension

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd l1-helpdesk-chatbot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Create a `.env.local` file in the root directory
   - Add your API keys:
     ```
     OPENAI_API_KEY=your_openai_api_key
     SUPABASE_URL=your_supabase_url
     SUPABASE_ANON_KEY=your_supabase_anon_key
     NEXT_PUBLIC_BASE_URL=http://localhost:3000
     ```

4. Set up Supabase:
   - Create a new Supabase project
   - Create a `faqs` table with the following schema:
     ```sql
     CREATE TABLE faqs (
       id SERIAL PRIMARY KEY,
       question TEXT NOT NULL,
       answer TEXT NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
     );
     ```
   - Create a `ticket_history` table with the following schema:
     ```sql
     CREATE TABLE ticket_history (
       id SERIAL PRIMARY KEY,
       ticket_id TEXT NOT NULL,
       subject TEXT NOT NULL,
       description TEXT,
       requester_email TEXT NOT NULL,
       requester_name TEXT,
       department TEXT,
       assigned_group TEXT,
       category TEXT,
       sub_category TEXT,
       priority TEXT,
       status TEXT,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       resolved_at TIMESTAMP WITH TIME ZONE,
       resolution_note TEXT
     );
     ```
   - Enable fuzzy search by running:
     ```sql
     CREATE EXTENSION IF NOT EXISTS pg_trgm;
     ```
   - Enable vector search by running:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
   - Create a stored procedure for searching FAQs:
     ```sql
     CREATE OR REPLACE FUNCTION search_faqs(search_term TEXT)
     RETURNS TABLE (
       id INTEGER,
       question TEXT,
       answer TEXT,
       similarity REAL
     ) 
     LANGUAGE plpgsql
     AS $$
     BEGIN
       RETURN QUERY
       SELECT
         f.id,
         f.question,
         f.answer,
         SIMILARITY(f.question, search_term) as similarity
       FROM
         faqs f
       WHERE
         f.question % search_term
       ORDER BY
         similarity DESC
       LIMIT 5;
     END;
     $$;
     ```
   - Run the SQL functions for vector similarity search:
     ```bash
     psql -h your_supabase_host -d postgres -U postgres -f sql/vector_functions.sql
     ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

7. Initialize ticket embeddings:
   - Import some ticket history data using the ticket import feature
   - Visit `/api/update-embeddings` to generate embeddings for imported tickets

## Project Structure

- `components/Chat.tsx` - Main chat component with UI and logic
- `components/TicketUpload.tsx` - Excel file upload component for ticket history import
- `app/api/chat/route.ts` - API route for handling chat messages, FAQ retrieval, and OpenAI integration
- `app/api/classify-ticket/route.ts` - API route for ticket classification
- `app/api/update-embeddings/route.ts` - API route for generating and updating ticket embeddings
- `app/api/import-tickets/route.ts` - API route for processing Excel files and importing ticket data
- `app/page.tsx` - Main page that includes the Chat component
- `app/ticket-import/page.tsx` - Page for the ticket import interface
- `lib/supabase.ts` - Supabase client and FAQ search utilities
- `lib/utils.ts` - Utility functions for the application
- `sql/vector_functions.sql` - SQL functions for vector similarity search
- `docs/ticket-classification.md` - Documentation for the ticket classification system

## How It Works

### Bot Processing Flow

When a user sends a message to the chatbot, the system follows this sequence of operations:

```
┌─────────────────┐     ┌─────────────────┐     ┌────────────────┐      ┌────────────────┐
│  User Message   │────>│ Language Check  │────>│ Conversation   │─────>│   FAQ Lookup   │
└─────────────────┘     └─────────────────┘     │ Phrase Check   │      └────────┬───────┘
                                                └────────┬───────┘               │
                                                         │                       │
                                                         ▼                       ▼
                                                ┌─────────────────┐      ┌────────────────┐
                                                │Is Conversational│      │  FAQ Match?    │
                                                │    Phrase?      │      └───────┬────────┘
                                                └───────┬─────────┘              │
                                                        │                        │
                 ┌────────────────────────┬───────No────┴──────┬──────No─────────┴────Yes───┐
                 │                        │                   Yes                           │
                 │                        │                    ▼                            │
                 ▼                        ▼             ┌─────────────────┐                 ▼
        ┌─────────────────┐     ┌─────────────────┐     │ Conversational  │      ┌─────────────────┐
        │ Ticket Check    │     │  OpenAI API     │     │    Response     │      │ Rephrase FAQ    │
        └────────┬────────┘     └────────┬────────┘     └────────┬────────┘      └────────┬────────┘
                 │                       │                       │                        │
                 ▼                       │                       │                        │
        ┌─────────────────┐              │                       │                        │
        │ Is Ticket?      │              │                       │                        │
        └────────┬────────┘              │                       │                        │
                 │                       │                       │                        │
        ┌────Yes─┴───No───┐              │                       │                        │
        │                 │              │                       │                        │
        ▼                 │              ▼                       ▼                        ▼
┌─────────────────┐       │      ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Classify Ticket │       │      │  AI Response    │     │Simple Greeting  │     │   FAQ Response  │
└────────┬────────┘       │      └────────┬────────┘     │   Response      │     └────────┬────────┘
         │                │               │              └────────┬────────┘              │
         ▼                │               │                       │                       │
┌─────────────────┐       │               │                       │                       │
│ Pattern-Based   │       │               │                       │                       │
│ Classification  │       │               │                       │                       │
└────────┬────────┘       │               │                       │                       │
         │                │               │                       │                       │
         ▼                │               │                       │                       │
┌─────────────────┐       │               │                       │                       │
│Vector Similarity│       │               │                       │                       │
│    Search       │       │               │                       │                       │
└────────┬────────┘       │               │                       │                       │
         │                │               │                       │                       │ 
         ▼                │               │                       │                       │
┌─────────────────┐       │               │                       │                       │
│ Combined Results│       │               │                       │                       │
└────────┬────────┘       │               │                       │                       │
         │                │               │                       │                       │
         └────────────────┼───────────────┼───────────────────────┼───────────────────────┘             
                          │               │                       │                       
                          ▼               ▼                       ▼                       
                  ┌───────────────────────────────────────────────┐                       
                  │            Translate Response (if needed)     │                       
                  └───────────────────────┬───────────────────────┘                       
                                          │                      
                                          ▼                      
                  ┌───────────────────────────────────────────────┐                      
                  │            Return Response to User            │                      
                  └───────────────────────────────────────────────┘                      
```

1. **Message Reception**:
   - The frontend Chat component captures the user's message
   - The message is sent to the `/api/chat` endpoint along with the session ID

2. **Language Detection & Translation**:
   - The system detects the language of the incoming message
   - If the message is not in English, it's translated to English for processing
   - The original language is stored to translate the response back later

3. **Conversational Phrase Check**:
   - The system checks if the message is a simple conversational phrase (greeting, farewell, etc.)
   - Uses pattern matching to identify common phrases like "hello", "how are you", "thanks", etc.
   - If identified as a conversational phrase, skips FAQ lookup and ticket classification

4. **FAQ Lookup** (if not a conversational phrase):
   - The system searches the Supabase `faqs` table for matching questions
   - First tries exact matching (case-insensitive)
   - If no exact match, performs fuzzy search with similarity threshold (0.5)
   - If a match is found with sufficient similarity, the FAQ answer is selected

5. **Ticket Classification Check**:
   - If no FAQ match is found OR if testing mode is enabled
   - The system checks if the message resembles a support ticket using the `isLikelyTicket` function
   - Analyzes for keywords, question patterns, and support-related terms

6. **Ticket Classification** (if message resembles a ticket):
   - Calls the `/api/classify-ticket` endpoint with the message content
   - **Pattern-Based Classification**: Uses OpenAI to analyze the message against predefined support groups
   - **Vector Similarity Search**: 
     - Checks if the `ticket_history` table exists and has the embedding column
     - Verifies if tickets with embeddings are available
     - Generates an embedding for the current message
     - Searches for similar historical tickets using vector similarity
     - Calculates confidence scores based on similar tickets' assigned groups
   - **Combined Results**: Merges both approaches to determine the final support group recommendation

7. **Response Generation**:
   - **For FAQ Matches**:
     - The FAQ answer is rephrased using OpenAI to sound more conversational
     - The source is marked as "faq" with the corresponding FAQ ID
   
   - **For Non-FAQ Messages**:
     - The message is sent to OpenAI's GPT API along with conversation history
     - OpenAI generates a response based on its training data
     - The source is marked as "ai"

   - **For Ticket-Like Messages**:
     - The ticket classification results are included in the response
     - Support group suggestions with confidence scores are added

8. **Language Translation of Response** (if needed):
   - If the original message was not in English, the response is translated back to the original language

9. **Response Delivery**:
   - The final response is sent back to the frontend
   - The Chat component displays the message with appropriate styling based on the source
   - For ticket classifications, the UI shows support group suggestions and confidence levels

10. **Conversation History Update**:
    - The user message and bot response are added to the conversation history
    - This history is used for context in future interactions

This end-to-end flow ensures that the chatbot can handle FAQs efficiently, classify support tickets accurately, and provide natural, conversational responses in the user's preferred language.

### Ticket Classification System

The ticket classification system uses two complementary approaches:

1. **Pattern-Based Classification**:
   - Uses OpenAI to analyze ticket content based on predefined support groups
   - Provides a primary support group recommendation with confidence score
   - Suggests alternative support groups with lower confidence

2. **Vector Similarity Classification**:
   - Converts ticket text to vector embeddings
   - Finds similar historical tickets using vector similarity search
   - Recommends support groups based on how similar tickets were assigned

3. **Combined Approach**:
   - Merges both classification methods for more accurate recommendations
   - Weighs historical data more heavily when available
   - Adjusts confidence scores based on agreement between approaches

The system integrates with the chat interface to provide real-time support group suggestions when a user's message appears to be a support ticket.

For more details, see [Ticket Classification Documentation](docs/ticket-classification.md).

### Ticket Import System

The ticket import system allows administrators to upload historical ticket data from Excel files:

1. **File Upload**: Users can drag and drop Excel files or browse to select them.
2. **Data Processing**:
   - The system reads the Excel file and maps columns to database fields
   - Required fields are validated (ticket_id, subject, requester_email)
   - Date fields are properly formatted
3. **Batch Processing**:
   - Records are processed in batches (default: 50 records per batch)
   - This prevents timeouts and provides better progress feedback
4. **Real-time Progress**:
   - The API streams progress updates to the client
   - Users can see the total records, processed count, and success/failure rates
5. **Error Handling**:
   - Individual record errors are tracked and reported
   - Database errors are logged and counted
   - Users receive clear feedback on any issues

The Excel file should contain the following columns (mapping to database fields):
- 'Ticket Id' → 'ticket_id'
- 'Subject' → 'subject'
- 'Description' → 'description'
- 'Requester Email' → 'requester_email'
- 'Requester Name' → 'requester_name'
- 'Department' → 'department'
- 'Group' → 'assigned_group'
- 'Category' → 'category'
- 'Sub-Category' → 'sub_category'
- 'Priority' → 'priority'
- 'Status' → 'status'
- 'Created Date' → 'created_at'
- 'Resolved Date' → 'resolved_at'
- 'Resolution Note' → 'resolution_note'

### Multilingual Support

The chatbot supports queries in multiple languages through a translation pipeline:

1. **Language Detection**: When a user sends a message, the system automatically detects the language.
2. **Query Translation**: If the message is not in English, it's translated to English for FAQ matching.
3. **FAQ Matching**: The translated query is used to search for matching FAQs in the database.
4. **Response Translation**: If a match is found, the FAQ answer is rephrased and translated back to the original language before being sent to the user.
5. **OpenAI Fallback**: If no match is found, the original query (in its original language) is sent to OpenAI, which can respond in the same language.

This approach allows users to interact with the chatbot in their preferred language while leveraging the English-language FAQ database.

### FAQ Retrieval and Conversational Responses

The chatbot follows a two-step process for answering user questions:

1. **FAQ Matching**: When a user sends a message, the system first checks the Supabase database for matching FAQs:
   - Performs an exact match search (case-insensitive)
   - If no exact match is found, performs a fuzzy search with a similarity threshold (default: 0.5)
   - The similarity threshold ensures that at least half of the words in the user's query match the FAQ question

2. **Conversational Rephrasing**: When an FAQ match is found:
   - The system uses OpenAI to rephrase the FAQ answer into a more conversational tone
   - This maintains the accuracy of the FAQ content while making the response feel more natural and engaging
   - If rephrasing fails, the original FAQ answer is used as a fallback

3. **OpenAI Fallback**: If no suitable FAQ match is found:
   - The system forwards the question to OpenAI's GPT API
   - The conversation history is included to maintain context
   - The AI generates a response based on its training data

### API

#### Chat API

The chatbot API accepts POST requests to `/api/chat` with the following format:

```json
{
  "message": "User's question here",
  "sessionId": "unique-session-identifier"
}
```

The API responds with:

```json
{
  "reply": "The answer to the user's question",
  "source": "faq" or "ai",
  "faqId": 123, // Only present if source is "faq"
  "ticketClassification": { // Only present for ticket-like queries
    "group": "Network Operations",
    "confidence": 85,
    "source": "pattern-based",
    "reasoning": "This is a VPN connectivity issue"
  }
}
```

#### Ticket Classification API

The ticket classification API accepts POST requests to `/api/classify-ticket` with the following format:

```json
{
  "subject": "Cannot connect to VPN",
  "description": "I'm trying to connect from home but getting an error"
}
```

The API responds with detailed classification results from both approaches.

#### Ticket Import API

The ticket import API accepts POST requests to `/api/import-tickets` with a multipart/form-data body containing an Excel file. It responds with a stream of JSON objects, each representing a progress update:

```json
{"type": "progress", "total": 100, "processed": 25, "successful": 23, "failed": 2, "percentage": 25}
```

When complete, it sends a final message:

```json
{"type": "complete", "total": 100, "successful": 95, "failed": 5}
```

If an error occurs, it sends an error message:

```json
{"type": "error", "message": "Error message here"}
```

### Error Handling

The application includes robust error handling for:
- Network failures
- API errors
- Supabase connection issues
- OpenAI API failures
- Translation errors
- Rephrasing failures (falls back to original FAQ content)
- File upload and processing errors
- Database insertion errors
- Vector embedding generation errors

### Hydration Error Prevention

To prevent hydration errors in Next.js, the session ID is generated only on the client side using a useEffect hook.

## Customization

### Adjusting the Similarity Threshold

The similarity threshold for FAQ matching can be adjusted in the `lib/supabase.ts` file:

```typescript
// Increase for stricter matching, decrease for more lenient matching
const SIMILARITY_THRESHOLD = 0.5; 
```

### Modifying the Rephrasing Prompt

The prompt used for conversational rephrasing can be customized in the `app/api/chat/route.ts` file:

```typescript
const rephrasePrompt = `Rephrase the following FAQ answer to sound more conversational and friendly...`;
```

### Language Support Configuration

The language detection and translation is handled automatically, but you can modify the translation prompt in the `translateToEnglishIfNeeded` function in `app/api/chat/route.ts`:

```typescript
const content = "You are a language detection and translation assistant...";
```

### Batch Size for Ticket Import

You can adjust the batch size for ticket imports in the `app/api/import-tickets/route.ts` file:

```typescript
const BATCH_SIZE = 50; // Number of records to process in each batch
```

### Support Groups for Ticket Classification

You can modify the support groups and their responsibilities in the `app/api/classify-ticket/route.ts` file:

```typescript
const supportGroups = [
  {
    name: "Network Operations",
    responsibilities: "Handle network connectivity issues...",
    examples: [
      "Cannot connect to VPN from home office",
      // Add more examples here
    ]
  },
  // Add or modify support groups here
];
```

### Testing Mode

The application includes a testing mode that modifies the normal processing flow for development and debugging purposes:

1. **Enabling Testing Mode**:
   - Set the `TESTING_MODE` flag to `true` in the `app/api/chat/route.ts` file
   - This can be useful during development or when testing specific components

2. **Modified Flow in Testing Mode**:
   - FAQ lookup is bypassed, and messages go directly to ticket classification
   - This allows developers to test the ticket classification system without FAQ interference
   - Console logs include "TESTING MODE" indicators to show when this mode is active

3. **Vector Similarity Testing**:
   - The system checks if the vector database is properly set up
   - If the embedding column exists and contains data, vector similarity search is used
   - If not, the system falls back to pattern-based classification only
   - Detailed error messages in the logs help diagnose setup issues

4. **Disabling Testing Mode**:
   - Set the `TESTING_MODE` flag back to `false` to restore normal operation
   - The system will then follow the complete flow: language detection → FAQ lookup → ticket classification (if needed) → response generation

Testing mode is particularly useful when setting up the vector similarity search functionality, as it allows you to verify that embeddings are being generated and used correctly without the FAQ system intercepting messages.

## Conversation History

The application maintains conversation history in memory using a session ID. This allows the AI to provide context-aware responses. In a production environment, you would want to store this in a database.

## Future Enhancements

- Integration with a database for persistent conversation history
- User authentication
- Support for different OpenAI models (e.g., GPT-4)
- Typing indicators with streaming responses
- Rich message formatting
- File upload capabilities
- FAQ management interface
- Analytics dashboard for tracking common questions
- Ticket history visualization and reporting
- Automated ticket creation from chat conversations
- Integration with ticketing systems (e.g., ServiceNow, Jira)
- Feedback mechanism to improve classification accuracy

## License

MIT

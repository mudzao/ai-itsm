# Ticket Classification System Documentation

This document provides detailed information about the ticket classification system implemented in the L1 Helpdesk Chatbot. The system uses a dual-approach methodology to accurately classify support tickets and recommend the most appropriate support group for handling each ticket.

## Table of Contents

1. [Overview](#overview)
2. [Classification Approaches](#classification-approaches)
   - [Pattern-Based Classification](#pattern-based-classification)
   - [Vector Similarity Classification](#vector-similarity-classification)
   - [Combined Approach](#combined-approach)
3. [Technical Implementation](#technical-implementation)
   - [OpenAI Integration](#openai-integration)
   - [Vector Database Setup](#vector-database-setup)
   - [Embedding Generation](#embedding-generation)
   - [Similarity Search Algorithm](#similarity-search-algorithm)
4. [Setup and Configuration](#setup-and-configuration)
   - [Database Prerequisites](#database-prerequisites)
   - [SQL Functions](#sql-functions)
   - [Importing Historical Tickets](#importing-historical-tickets)
   - [Generating Embeddings](#generating-embeddings)
5. [Customization Options](#customization-options)
   - [Support Groups](#support-groups)
   - [Confidence Thresholds](#confidence-thresholds)
   - [Testing Mode](#testing-mode)
6. [Troubleshooting](#troubleshooting)
   - [Common Issues](#common-issues)
   - [Debugging Tips](#debugging-tips)

## Overview

The ticket classification system is designed to analyze user messages that appear to be support tickets and determine which IT support group should handle them. This helps streamline the support process by automatically routing tickets to the appropriate teams.

The system uses two complementary approaches:
1. **Pattern-Based Classification**: Uses OpenAI to analyze ticket content against predefined support groups
2. **Vector Similarity Classification**: Finds similar historical tickets using vector embeddings and similarity search

These approaches are combined to provide more accurate recommendations, especially as the system accumulates more historical ticket data.

## Classification Approaches

### Pattern-Based Classification

The pattern-based approach uses OpenAI's language models to analyze the content of a ticket and match it against predefined support groups and their responsibilities.

**How it works:**

1. The system sends the ticket subject and description to OpenAI's API
2. A detailed system prompt provides OpenAI with information about each support group, including:
   - Group name
   - Responsibilities
   - Example tickets that would be handled by each group
3. OpenAI analyzes the ticket and returns:
   - Primary support group recommendation with confidence score
   - Brief reasoning for the classification
   - Alternative support groups with lower confidence scores

**Advantages:**
- Works without historical data
- Can handle novel or unusual tickets
- Provides reasoning for classifications
- Offers alternative suggestions

**Limitations:**
- May not reflect organization-specific routing patterns
- Confidence scores are estimates based on pattern matching
- No learning from past ticket assignments

### Vector Similarity Classification

The vector similarity approach uses historical ticket data to find similar tickets and bases recommendations on how those tickets were assigned in the past.

**How it works:**

1. The system converts the ticket text (subject + description) into a vector embedding using OpenAI's embedding model
2. This embedding is compared to embeddings of historical tickets stored in the database
3. The system finds the most similar tickets based on cosine similarity
4. Support group recommendations are generated based on the assigned groups of similar tickets
5. Confidence scores are calculated based on the frequency of each group in the similar tickets

**Advantages:**
- Learns from organization-specific routing patterns
- Improves over time as more historical data is accumulated
- Based on actual past ticket assignments
- Can capture nuanced patterns specific to your organization

**Limitations:**
- Requires historical ticket data with assigned groups
- Needs vector database setup and embedding generation
- Performance depends on the quality and quantity of historical data

### Combined Approach

The system combines both approaches to leverage their respective strengths and provide more accurate recommendations.

**Combination logic:**

1. If no vector similarity results are available (no historical data), use only pattern-based classification
2. If both approaches agree on the top recommendation, combine confidence scores with more weight given to historical data
3. If there's disagreement but OpenAI's suggestion appears in vector results (not as top result), use a weighted combination
4. If vector results have high confidence (>70%) but disagree with OpenAI, prefer the historical data
5. In other cases of disagreement, default to OpenAI's suggestion but with reduced confidence

This approach ensures that:
- The system works even without historical data
- Historical patterns are prioritized when available
- Confidence scores reflect the level of agreement between approaches

## Technical Implementation

### OpenAI Integration

The system uses two OpenAI APIs:

1. **GPT API (gpt-3.5-turbo)** for pattern-based classification:
   - Analyzes ticket content against predefined support groups
   - Returns structured JSON with primary and alternative recommendations
   - Uses a temperature of 0.3 for more consistent results

2. **Embeddings API (text-embedding-ada-002)** for vector similarity:
   - Converts ticket text to vector embeddings (1536 dimensions)
   - Used for both new tickets and historical ticket data
   - Enables semantic similarity search

### Vector Database Setup

The system uses PostgreSQL with the pgvector extension for vector storage and similarity search:

1. **pgvector extension**: Enables vector operations in PostgreSQL
2. **Embedding column**: Added to the ticket_history table to store vector representations
3. **Vector index**: Created using IVFFLAT for efficient similarity search
4. **SQL functions**: Custom functions for vector operations and similarity search

### Embedding Generation

Embeddings are generated for:

1. **Historical tickets**: When imported or via the `/api/update-embeddings` endpoint
2. **New tickets**: At classification time for comparison with historical data

The embedding generation process:
1. Combines ticket subject and description
2. Sends text to OpenAI's embedding API
3. Stores the resulting vector in the database (for historical tickets)

### Similarity Search Algorithm

The similarity search uses:

1. **Cosine similarity**: Measures the angle between vectors (1 - cosine distance)
2. **Threshold filtering**: Only returns tickets above a similarity threshold (default: 0.5)
3. **Top-N matching**: Returns the most similar tickets (default: 5)
4. **Group frequency analysis**: Counts occurrences of each support group in similar tickets
5. **Confidence calculation**: Converts group frequencies to confidence percentages

## Setup and Configuration

### Database Prerequisites

1. **PostgreSQL database** with Supabase access
2. **pgvector extension** for vector operations
3. **ticket_history table** with the following schema:
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

### SQL Functions

The system requires several SQL functions for vector operations:

1. **check_vector_extension()**: Checks if pgvector is installed
2. **create_vector_extension()**: Creates the pgvector extension if not present
3. **check_embedding_column()**: Checks if the embedding column exists
4. **add_embedding_column()**: Adds the embedding column to the ticket_history table
5. **match_tickets()**: Performs vector similarity search

These functions are defined in `sql/vector_functions.sql` and should be executed on your database.

### Importing Historical Tickets

To import historical ticket data:

1. Prepare an Excel file with ticket data (see [Ticket Import System](../README.md#ticket-import-system) for details)
2. Use the ticket import interface at `/ticket-import`
3. Upload the Excel file and monitor the import progress
4. Ensure the `assigned_group` field is populated for accurate classification

### Generating Embeddings

After importing tickets, generate embeddings:

1. **Automatic method**: Visit `/api/update-embeddings` in your browser
2. **Batch processing**: The system processes tickets in batches (default: 10)
3. **Monitoring**: Check the response for progress information
4. **Verification**: Confirm that embeddings were generated successfully

## Customization Options

### Support Groups

You can customize the support groups in `app/api/classify-ticket/route.ts`:

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

For each group, provide:
- **name**: The support group name
- **responsibilities**: A detailed description of what the group handles
- **examples**: Sample tickets that would be assigned to this group

Adding more detailed examples improves the pattern-based classification accuracy.

### Confidence Thresholds

You can adjust various confidence thresholds:

1. **Vector similarity threshold** (in `match_tickets` function):
   ```sql
   -- Default: 0.5
   AND 1 - (t.embedding <=> query_embedding) > match_threshold
   ```

2. **UI display threshold** (in `Chat.tsx`):
   ```typescript
   // Only show classification if confidence is above threshold
   {classification.confidence >= 50 && (
     // Display classification UI
   )}
   ```

3. **Combined approach thresholds** (in `determineFinalRecommendation` function):
   ```typescript
   // If vector has strong confidence but OpenAI disagrees
   if (vectorResults[0].confidence > 70) {
     // Use vector results
   }
   ```

### Testing Mode

The application includes a testing mode for development and debugging:

1. **Enabling Testing Mode**:
   - Set the `TESTING_MODE` flag to `true` in `app/api/chat/route.ts`
   - This bypasses FAQ lookup and goes directly to ticket classification

2. **Using Testing Mode**:
   - Send test messages to the chatbot
   - Observe classification results in the UI
   - Check console logs for detailed information

## Troubleshooting

### Common Issues

1. **"Vector extension not available"**:
   - Ensure PostgreSQL has pgvector extension installed
   - Check database permissions for creating extensions

2. **"Embedding column could not be created"**:
   - Verify database permissions
   - Check if the ticket_history table exists

3. **"No tickets with embeddings"**:
   - Visit `/api/update-embeddings` to generate embeddings
   - Check if historical tickets have been imported

4. **Low confidence scores**:
   - Add more examples to support groups
   - Import more historical tickets
   - Check if tickets have assigned_group values

### Debugging Tips

1. **Check console logs** for detailed error messages
2. **Inspect API responses** in browser developer tools
3. **Test with simple, clear ticket subjects** first
4. **Verify database setup** using Supabase interface
5. **Use testing mode** to bypass FAQ lookup and focus on classification

For persistent issues, check the database logs and ensure all SQL functions are properly installed. 
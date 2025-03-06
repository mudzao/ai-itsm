-- First, create the vector extension if it doesn't exist
CREATE EXTENSION IF NOT EXISTS vector;

-- Add the embedding column to the ticket_history table if it doesn't exist
ALTER TABLE ticket_history ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create an index for faster similarity search
CREATE INDEX IF NOT EXISTS ticket_embedding_idx ON ticket_history USING ivfflat (embedding vector_cosine_ops);

-- Verify the column was added
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM 
  information_schema.columns 
WHERE 
  table_name = 'ticket_history' 
  AND column_name = 'embedding'; 
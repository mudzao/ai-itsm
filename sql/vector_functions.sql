-- First, create the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to check if pgvector extension exists
CREATE OR REPLACE FUNCTION check_vector_extension()
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  );
END;
$$;

-- Function to create pgvector extension
CREATE OR REPLACE FUNCTION create_vector_extension()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
END;
$$;

-- Function to check if embedding column exists in ticket_history table
CREATE OR REPLACE FUNCTION check_embedding_column()
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ticket_history'
    AND column_name = 'embedding'
  );
END;
$$;

-- Function to add embedding column to ticket_history table
CREATE OR REPLACE FUNCTION add_embedding_column()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  ALTER TABLE ticket_history ADD COLUMN IF NOT EXISTS embedding vector(1536);
  
  -- Create index for faster similarity search
  CREATE INDEX IF NOT EXISTS ticket_embedding_idx ON ticket_history USING ivfflat (embedding vector_cosine_ops);
END;
$$;

-- Function to match tickets based on vector similarity
CREATE OR REPLACE FUNCTION match_tickets(query_embedding vector(1536), match_threshold float, match_count int)
RETURNS TABLE (
  id int,
  ticket_id text,
  subject text,
  description text,
  assigned_group text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.ticket_id,
    t.subject,
    t.description,
    t.assigned_group,
    1 - (t.embedding <=> query_embedding) as similarity
  FROM
    ticket_history t
  WHERE
    t.embedding IS NOT NULL
    AND t.assigned_group IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY
    t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to update embeddings for tickets
CREATE OR REPLACE FUNCTION update_ticket_embeddings(ticket_ids int[])
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count int := 0;
BEGIN
  -- This is a placeholder function
  -- In a real implementation, this would call an external service to generate embeddings
  -- and update the ticket_history table
  
  -- For now, we'll just return the count of ticket IDs provided
  updated_count := array_length(ticket_ids, 1);
  
  RETURN updated_count;
END;
$$; 
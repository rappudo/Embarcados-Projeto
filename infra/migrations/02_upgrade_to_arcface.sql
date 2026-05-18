-- 1. Remove all old 128-d MobileFaceNet vectors, as they are mathematically
-- incompatible with the new 512-d ArcFace model.
TRUNCATE TABLE embeddings;

-- 2. Expand the vector column to hold 512 dimensions.
ALTER TABLE embeddings ALTER COLUMN vector TYPE vector(512);

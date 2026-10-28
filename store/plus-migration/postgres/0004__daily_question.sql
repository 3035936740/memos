-- The matching Go migration backfills GENERAL using crypto/rand before recording completion.
-- No schema columns are needed because daily question configuration lives in GENERAL JSON.
SELECT 1;

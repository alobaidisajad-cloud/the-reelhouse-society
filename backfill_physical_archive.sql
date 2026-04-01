-- backfill_physical_archive.sql
-- Run this script in the Supabase SQL Editor to retroactively populate the Physical Archive
-- with any films that users previously logged using the "Physical Media" dropdown (DVD, Blu-Ray, etc.)

INSERT INTO physical_archive (user_id, film_id, film_title, poster_path, year, formats, condition, notes, created_at)
SELECT 
    user_id,
    film_id,
    film_title,
    poster_path,
    year,
    CASE 
        WHEN physical_media = 'DVD' THEN ARRAY['dvd']
        WHEN physical_media = 'Blu-Ray' THEN ARRAY['bluray']
        WHEN physical_media = '4K UHD' THEN ARRAY['4k']
        WHEN physical_media = 'VHS' THEN ARRAY['vhs']
        ELSE ARRAY['dvd']
    END,
    'good',
    '',
    created_at
FROM logs
WHERE physical_media IS NOT NULL 
  AND physical_media IN ('DVD', 'Blu-Ray', '4K UHD', 'VHS')
ON CONFLICT (user_id, film_id) 
DO UPDATE SET
    formats = EXCLUDED.formats;

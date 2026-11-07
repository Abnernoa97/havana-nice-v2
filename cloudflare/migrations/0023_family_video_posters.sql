-- HAVANA NICE V2: private real video preview images, no duplicate media service.
-- New nullable fields preserve every existing photo/video and legacy original grant.
ALTER TABLE family_media ADD COLUMN poster_key TEXT;
ALTER TABLE family_media ADD COLUMN poster_mime TEXT CHECK(poster_mime IN ('image/webp','image/jpeg'));
ALTER TABLE family_media_grants ADD COLUMN variant TEXT NOT NULL DEFAULT 'original'
 CHECK(variant IN ('original','poster'));

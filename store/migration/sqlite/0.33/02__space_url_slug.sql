ALTER TABLE space ADD COLUMN url_slug TEXT;
CREATE UNIQUE INDEX idx_space_url_slug ON space(url_slug) WHERE url_slug IS NOT NULL;

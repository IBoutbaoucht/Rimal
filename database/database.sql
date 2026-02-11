

CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  github_id BIGINT UNIQUE NOT NULL,
  full_name VARCHAR(500) UNIQUE NOT NULL,

  name VARCHAR(255) NOT NULL,
  owner_login VARCHAR(255),
  owner_avatar_url TEXT,
  
  description TEXT,
  html_url TEXT,
  homepage_url TEXT,
  
  -- Metrics
  stars_count INTEGER DEFAULT 0,
  forks_count INTEGER DEFAULT 0,
  watchers_count INTEGER DEFAULT 0,
  open_issues_count INTEGER DEFAULT 0,
  size_kb INTEGER DEFAULT 0,

  -- Content
  language VARCHAR(100),
  topics TEXT[],
  license_name VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  pushed_at TIMESTAMPTZ,
  
  -- Status & Features
  is_fork BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_disabled BOOLEAN DEFAULT FALSE,
  allow_forking BOOLEAN DEFAULT TRUE,
  is_template BOOLEAN DEFAULT FALSE

);


-- CREATE TABLE types (
--     id SMALLSERIAL PRIMARY KEY,
--     name TEXT UNIQUE NOT NULL
-- );

-- INSERT INTO types (name)
-- VALUES ('7d'), ('30d'), ('90d');



-- CREATE TABLE repositories_types (
--     repository_id BIGINT REFERENCES repositories(id) ON DELETE CASCADE,
--     type_id SMALLINT REFERENCES types(id) ON DELETE CASCADE,
--     PRIMARY KEY (repository_id, type_id)
-- );


-- CREATE TABLE repositories_types (
--     github_id BIGINT REFERENCES repositories(github_id) ON DELETE CASCADE,
--     type_name TEXT ,
--     PRIMARY KEY (github_id, type_name)
-- );

CREATE TABLE repository_stats (
  github_id BIGINT REFERENCES repositories(github_id) ON DELETE CASCADE,
  type_name TEXT NOT NULL,           -- '7d', '30d', '90d'
  stars_gained INTEGER NOT NULL,
  measured_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (github_id, type_name)
);


-- CREATE INDEX idx_repository_types_type ON repositories_types(type_name);
-- CREATE INDEX idx_repository_types_repository ON repositories_types(github_id);

CREATE INDEX idx_repository_stats_type ON repository_stats(type_name);
CREATE INDEX idx_repository_stats_github_id ON repository_stats(github_id);
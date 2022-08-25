CREATE TABLE IF NOT EXISTS "auth" (
	"id"	INTEGER NOT NULL UNIQUE,
	"owner"	INTEGER NOT NULL,
	"token"	TEXT NOT NULL UNIQUE,
	"last_seen"	INTEGER NOT NULL,
	"ua"	TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id"	INTEGER NOT NULL UNIQUE,
	"owner"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL,
	"scopes"	TEXT NOT NULL,
	"key"	INTEGER NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS "tasks" (
	"id"	INTEGER NOT NULL UNIQUE,
	"list_id"	INTEGER NOT NULL,
	"owner"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL,
	"due_date"	INTEGER,
	"steps"	TEXT DEFAULT '[]',
	"desc"	TEXT,
	"is_complete"	INTEGER NOT NULL DEFAULT 0,
	"is_repeat"	INTEGER NOT NULL DEFAULT 0,
	"repeat_unit"	TEXT,
	"repeat_count"	INTEGER
);
CREATE TABLE IF NOT EXISTS "users" (
	"id"	INTEGER NOT NULL UNIQUE,
	"discord_id"	TEXT NOT NULL UNIQUE,
	"name"	TEXT NOT NULL,
	"discriminator"	INTEGER NOT NULL,
	"picture"	TEXT,
	"is_new"	INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS "lists" (
	"id"	INTEGER NOT NULL UNIQUE,
	"owner"	INTEGER NOT NULL,
	"name"	TEXT NOT NULL,
	"hue"	TEXT,
	"sort_pos"	INTEGER NOT NULL DEFAULT 0,
	"count_pending"	INTEGER NOT NULL DEFAULT 0,
	"count_complete"	INTEGER NOT NULL DEFAULT 0,
	"sort_order"	TEXT NOT NULL DEFAULT 'created',
	"sort_reverse"	INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "list_folders" (
	"id"	INTEGER NOT NULL UNIQUE,
	"owner"	INTEGER NOT NULL,
	"name"	INTEGER NOT NULL
);

PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('student','admin')), display_name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY, title TEXT NOT NULL, position INTEGER NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, group_no INTEGER NOT NULL, spelling TEXT NOT NULL, meaning TEXT NOT NULL, image TEXT, UNIQUE(lesson_id,spelling,meaning));
CREATE TABLE IF NOT EXISTS progress (user_id TEXT NOT NULL REFERENCES users(id), word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE, mode TEXT NOT NULL, correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,word_id,mode));
CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,word_id INTEGER NOT NULL,mode TEXT NOT NULL,correct INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS attempts_user_time ON attempts(user_id,created_at);
CREATE TABLE IF NOT EXISTS unlocks (user_id TEXT NOT NULL,lesson_id INTEGER NOT NULL,stage INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,lesson_id));
INSERT OR IGNORE INTO users(id,role,display_name) VALUES ('ian','student','IAN'),('admin','admin','管理者');
INSERT OR IGNORE INTO lessons(id,title,position) VALUES (1,'第 1 課',1),(2,'第 2 課',2),(3,'第 3 課',3);
INSERT OR IGNORE INTO words(lesson_id,group_no,spelling,meaning,image) VALUES
(1,1,'one','一','1️⃣'),(1,2,'meet','認識；相遇',NULL),(1,3,'class','班級','🏫'),(1,4,'here','這裡',NULL),(1,5,'red','紅色','🔴'),(1,6,'pen','筆','🖊️'),(1,7,'English','英語','🔤'),(1,8,'teacher','老師','👩‍🏫'),
(2,1,'two','二','2️⃣'),(2,2,'blue','藍色','🔵'),(2,3,'book','書','📖'),(2,4,'green','綠色','🟢'),(2,5,'pink','粉紅色','🩷'),(2,6,'purple','紫色','🟣'),(2,7,'pencil','鉛筆','✏️'),(2,8,'Miss','小姐（稱謂）',NULL),(2,8,'miss','想念',NULL),
(3,1,'three','三','3️⃣'),(3,2,'cap','棒球帽','🧢'),(3,3,'come','來',NULL),(3,4,'his','他的',NULL),(3,5,'please','請',NULL),(3,6,'yes','是的',NULL),(3,7,'this','這',NULL),(3,8,'whose','誰的',NULL);

-- Memos Plus demonstrations; regenerated only by explicit demo mode.
INSERT INTO space(id,uid,url_slug,title,description,access_mode) VALUES
 (1,'demo-garden','garden','The garden','Styles, tag effects and quiet moments.','PUBLIC'),
 (2,'demo-workshop','workshop','The workshop','Series, code and polls.','PUBLIC'),
 (3,'demo-lounge','lounge','Members lounge','Sign in to discover protected content.','AUTHENTICATED');
INSERT INTO space_member(space_id,user_id,status,role) VALUES
 (1,1,'ACTIVE','ADMIN'),(2,1,'ACTIVE','ADMIN'),(3,1,'ACTIVE','ADMIN'),(1,2,'ACTIVE','USER'),(2,2,'ACTIVE','USER');
INSERT INTO memo(uid,creator_id,content,visibility,pinned,payload,space_id) VALUES
 ('plus-style-guide',1,'# Welcome to Memos Plus

Try Blog 2 and switch visual styles in the top bar: glass, Frutiger Aero, pixel, handdrawn, developer and more. Each style can use your preferred color palette.

Open a tagged article to discover its effects. This isolated demo resets every 24 hours; please do not store personal information here. #welcome','PUBLIC',1,'{"tags":["welcome"]}',NULL),
 ('plus-rain-demo',3,'# A rainy afternoon

Water beads gather on the window while the article remains readable. #rain','PUBLIC',0,'{"tags":["rain"]}',1),
 ('plus-cat-demo',4,'# A passing visitor

Hover the card and watch a small cat pass by. #cat','PUBLIC',0,'{"tags":["cat"]}',1),
 ('plus-travel-demo',3,'# Postcard from the coast

A short trip, a notebook and the sound of the sea. #travel','PUBLIC',0,'{"tags":["travel"]}',1),
 ('plus-series-one',2,'# Building a small garden: 1

Start small. Keep the path clear, and give each seed enough room. #series/garden','PUBLIC',0,'{"tags":["series","series/garden"]}',2),
 ('plus-series-two',2,'# Building a small garden: 2

Return tomorrow and write down what changed. #series/garden','PUBLIC',0,'{"tags":["series","series/garden"]}',2),
 ('plus-poll-demo',1,'# Your favorite time to read

[[vote]]','PUBLIC',0,'{"poll":{"question":"When do you enjoy reading?","options":[{"id":"morning","text":"A quiet morning"},{"id":"evening","text":"A slow evening"}],"voterType":"ANYONE","maxSelections":1}}',2),
 ('plus-music-demo',1,'# Quiet loop

An original, locally generated eight-second ambient chord. Enable the music player to try seamless looping. #music','PUBLIC',0,'{"tags":["music"]}',1);
INSERT INTO attachment(uid,creator_id,filename,type,size,memo_id,storage_type,reference)
 SELECT 'plus-demo-loop',1,'quiet-loop.wav','audio/wav',256044,id,'DATABASE','' FROM memo WHERE uid='plus-music-demo';
INSERT INTO system_setting(name,value) VALUES
 ('GENERAL','{"customProfile":{"title":"Memos Plus Demo"},"firstVisitDefaultStyle":"default","setupCompleted":true,"showPoweredBy":true,"musicConfigJson":"{\"enabled\":true,\"autoplay\":false,\"defaultMuted\":false,\"defaultVolume\":0.2,\"mode\":\"sequential\",\"tracks\":[{\"id\":\"demo-loop\",\"title\":\"Quiet loop\",\"artist\":\"Memos Plus\",\"url\":\"/file/attachments/plus-demo-loop/quiet-loop.wav\"}]}"}'),
 ('STORAGE','{"storageType":"LOCAL","uploadSizeLimitMb":"1","filepathTemplate":"assets/{uuid}_{filename}"}');

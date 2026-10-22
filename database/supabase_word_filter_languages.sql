-- Curse words in other languages, for the word filter. Run this AFTER
-- supabase_word_filter_schema.sql (that file made the table and the "mode"
-- column). Safe to run again: a word that is already there is skipped.
--
-- The three modes (blocked_words.mode):
--   word  - the word must stand alone ("reputation" never matches "puta");
--           for English-style endings (-s -ed -ing) the schema allows them.
--           Used for every language that puts spaces between words.
--   stem  - the word is a root that grows endings and prefixes (Russian,
--           Arabic, Hindi...), so the root is found INSIDE a word and the whole
--           word is hidden: "нахуй", "пиздец" and "хуйня" all go.
--   exact - the text is matched as it is, anywhere, because the writing has no
--           spaces between words (Chinese, Japanese, Korean, Thai). Only
--           specific curse phrases are listed, never one short fragment that
--           could sit inside a normal word (for example 我操 is left out: it is
--           inside 我操心, "I worry").
--
-- (The schema file adds two more switches for the English and Filipino words:
-- mode 'tail' and 'loose'. They do not apply to the words in this file.)
--
-- Languages: Spanish, Portuguese, Italian, French, German, Dutch, Swedish /
-- Norwegian / Danish / Finnish, Polish, Czech / Slovak, Serbian / Croatian,
-- Hungarian, Romanian, Turkish, Indonesian / Malay, Vietnamese, Hindi / Urdu,
-- Arabic, Chinese (pinyin and characters), Japanese, Korean, Thai, Greek,
-- Hebrew, Russian / Ukrainian, and Visayan / Ilocano / Tagalog extras.
--
-- Left out on purpose because they are also normal words or names (so the
-- filter would hurt honest text): hora, cono, con, pute (a turkey), kuss (a
-- kiss), kalb (a calf), lund (a city, a surname), randi (a name), troia (Troy),
-- pula (a city), manko (a surname), piste (a ski run), asu (the university),
-- suka (Indonesian "to like"), pic, got, fan, bite, kos, sala, babi, dmm.
--
-- No filter knows every word in every language. This list is a good start, not
-- a promise; add a word with: insert into public.blocked_words (word) values ('...').

-- Whole words (and phrases).
insert into public.blocked_words (word) values
  -- Visayan / Ilocano / Tagalog extras
  ('amputa'), ('ampota'), ('salsal'), ('iyot'), ('yawa'), ('yawaa'), ('pisti'), ('giatay'),
  ('bilat'), ('ukinnam'), ('ukininam'), ('ukinam'), ('tangna'),
  -- Spanish
  ('mierda'), ('cabron'), ('cabrón'), ('cabrona'), ('coño'), ('pendejo'), ('pendeja'),
  ('joder'), ('jodete'), ('jódete'), ('carajo'), ('hijueputa'), ('hijoputa'), ('hijo de puta'),
  ('gilipollas'), ('pinche'), ('culero'), ('verga'), ('chingar'), ('chingado'), ('chingada'),
  ('chingadera'), ('chinga tu madre'), ('maricon'), ('maricón'), ('marica'), ('mamon'),
  ('mamón'), ('cojones'), ('follar'), ('puñeta'),
  -- Portuguese
  ('caralho'), ('foda'), ('foder'), ('fodase'), ('merda'), ('buceta'), ('boceta'), ('viado'),
  ('cuzao'), ('cuzão'), ('filho da puta'), ('fdp'), ('otario'), ('otário'), ('babaca'),
  ('cacete'), ('arrombado'), ('vsf'),
  -- Italian
  ('cazzo'), ('minchia'), ('stronzo'), ('stronza'), ('vaffanculo'), ('puttana'), ('coglione'),
  ('coglioni'), ('figa'), ('bastardo'), ('culo'), ('porcodio'), ('baldracca'), ('mignotta'),
  ('pompino'),
  -- French
  ('merde'), ('putain'), ('salope'), ('connard'), ('connasse'), ('encule'), ('enculé'),
  ('enculer'), ('nique'), ('niquer'), ('ntm'), ('foutre'), ('batard'), ('bâtard'), ('salaud'),
  ('petasse'), ('pétasse'), ('fils de pute'),
  -- German
  ('scheisse'), ('scheiße'), ('scheiß'), ('arschloch'), ('arsch'), ('wichser'), ('fotze'),
  ('hurensohn'), ('hure'), ('fick'), ('ficken'), ('fickt'), ('ficker'), ('verfickt'),
  ('schlampe'), ('schwuchtel'), ('scheisskerl'), ('spast'), ('drecksau'),
  -- Dutch
  ('kut'), ('klootzak'), ('lul'), ('hoer'), ('neuk'), ('neuken'), ('godverdomme'),
  ('flikker'), ('kankerlijer'),
  -- Swedish / Norwegian / Danish / Finnish
  ('fitta'), ('faen'), ('jävla'), ('jævla'), ('knulla'), ('vittu'), ('perkele'), ('saatana'),
  ('paska'),
  -- Polish / Czech / Slovak / Serbian / Croatian / Hungarian / Romanian
  ('kurwa'), ('kurwy'), ('chuj'), ('pierdole'), ('pierdolę'), ('pierdolić'), ('pierdolic'),
  ('jebac'), ('jebać'), ('jebany'), ('skurwysyn'), ('spierdalaj'), ('cipa'), ('pizda'),
  ('pizdec'), ('kurva'), ('hovno'), ('kokot'), ('piča'), ('kurac'), ('picka'), ('govno'),
  ('jebem'), ('jebote'), ('jebiga'), ('fasz'), ('geci'), ('picsa'), ('baszd'), ('buzi'),
  ('faszfej'), ('muie'), ('futut'), ('curva'), ('cacat'), ('dracu'),
  -- Turkish
  ('orospu'), ('orospu cocugu'), ('orospu çocuğu'), ('sikik'), ('siktir'), ('sikeyim'),
  ('amk'), ('yarrak'), ('amcik'), ('amcık'), ('piç'), ('göt'), ('götveren'), ('gotveren'),
  ('ibne'), ('pezevenk'), ('kahpe'),
  -- Indonesian / Malay
  ('anjing'), ('bangsat'), ('bajingan'), ('kontol'), ('memek'), ('ngentot'), ('jancok'),
  ('jancuk'), ('goblok'), ('kimak'), ('pukimak'), ('sundal'), ('pelacur'), ('lonte'),
  ('brengsek'), ('keparat'), ('pantek'), ('cibai'), ('lanjiao'), ('lan jiao'),
  -- Vietnamese
  ('ditme'), ('dit me'), ('dume'), ('du ma'), ('dcm'), ('vcl'), ('dit con me'),
  -- Hindi / Urdu (Latin letters)
  ('chutiya'), ('chutiye'), ('madarchod'), ('madar chod'), ('behenchod'), ('behen chod'),
  ('bhenchod'), ('bhosdike'), ('bhosdi'), ('bhosda'), ('gandu'), ('harami'), ('haramzada'),
  ('haramzade'), ('gaand'), ('kamina'), ('kamine'), ('bsdk'), ('mkc'), ('chodu'), ('lavde'),
  ('lawde'),
  -- Arabic (Latin letters)
  ('sharmouta'), ('sharmuta'), ('sharmoota'), ('ya kalb'), ('ibn kalb'), ('ibn sharmouta'),
  ('zebi'), ('kosomak'), ('kosommak'),
  -- Chinese (pinyin)
  ('caonima'), ('cao ni ma'), ('tamade'), ('ta ma de'), ('nmsl'), ('shabi'), ('sha bi'),
  ('wangbadan'), ('wang ba dan'), ('gundan'), ('gun dan'), ('biaozi'), ('hundan'),
  -- Japanese (romaji)
  ('kuso'), ('kusottare'), ('chikusho'), ('chikushou'), ('kisama'), ('chinko'), ('chinpo'),
  ('bakayaro'), ('bakayarou'),
  -- Korean (romaji)
  ('ssibal'), ('sibal'), ('shibal'), ('ssival'), ('gaesaekki'), ('gaesekki'), ('gaesaeki'),
  ('byeongsin'), ('byungshin'), ('jiral'),
  -- Greek
  ('μαλάκας'), ('μαλακας'), ('μαλάκα'), ('μαλακα'), ('μαλακία'), ('μαλακια'), ('γαμώτο'),
  ('γαμωτο'), ('πουτάνα'), ('πουτανα'), ('σκατά'), ('σκατα'), ('πούστης'), ('πουστης'),
  ('γαμώ'), ('γαμω'),
  -- Hebrew
  ('זונה'), ('בן זונה'), ('שרמוטה'), ('חרא'),
  -- Arabic (Arabic letters)
  ('خرا'), ('ابن الكلب'), ('كس امك'), ('منيك'),
  -- Russian / Ukrainian
  ('бля'), ('сука'), ('суки'), ('суку')
on conflict (word) do nothing;

-- Roots that grow endings and prefixes: the root is found inside a word and the
-- whole word is hidden.
insert into public.blocked_words (word, mode) values
  -- Russian / Ukrainian
  ('хуй', 'stem'), ('пизд', 'stem'), ('ебат', 'stem'), ('ебан', 'stem'), ('ебал', 'stem'),
  ('блят', 'stem'), ('бляд', 'stem'), ('залуп', 'stem'), ('мудак', 'stem'), ('пидор', 'stem'),
  ('пидр', 'stem'), ('гандон', 'stem'), ('гондон', 'stem'), ('уебок', 'stem'), ('ебло', 'stem'),
  ('долбоеб', 'stem'), ('пізд', 'stem'), ('єбат', 'stem'), ('єбан', 'stem'),
  -- Arabic
  ('شرموط', 'stem'), ('كسمك', 'stem'), ('عاهر', 'stem'), ('منيوك', 'stem'),
  -- Hindi (Devanagari)
  ('चूतिया', 'stem'), ('मादरचोद', 'stem'), ('बहनचोद', 'stem'), ('भोसड़ी', 'stem'),
  ('गांडू', 'stem'), ('रंडी', 'stem'), ('हरामी', 'stem'), ('हरामजादा', 'stem'),
  ('लौड़ा', 'stem'), ('लवड़ा', 'stem')
on conflict (word) do nothing;

-- Writing with no spaces between words: matched exactly, anywhere.
insert into public.blocked_words (word, mode) values
  -- Chinese
  ('操你妈', 'exact'), ('操你媽', 'exact'), ('草泥马', 'exact'), ('草泥馬', 'exact'),
  ('他妈的', 'exact'), ('他媽的', 'exact'), ('傻逼', 'exact'), ('傻屄', 'exact'),
  ('婊子', 'exact'), ('王八蛋', 'exact'), ('狗娘养的', 'exact'), ('狗娘養的', 'exact'),
  ('你妈逼', 'exact'), ('你媽逼', 'exact'), ('鸡巴', 'exact'), ('雞巴', 'exact'),
  ('去你妈', 'exact'), ('去你媽', 'exact'), ('日你妈', 'exact'), ('日你媽', 'exact'),
  ('干你娘', 'exact'), ('幹你娘', 'exact'),
  -- Japanese
  ('くそったれ', 'exact'), ('クソッタレ', 'exact'), ('ちくしょう', 'exact'), ('チクショウ', 'exact'),
  ('てめえ', 'exact'), ('てめぇ', 'exact'), ('くたばれ', 'exact'), ('死ね', 'exact'),
  ('まんこ', 'exact'), ('マンコ', 'exact'), ('おまんこ', 'exact'), ('ちんこ', 'exact'),
  ('チンコ', 'exact'), ('ちんぽ', 'exact'), ('チンポ', 'exact'),
  -- Korean
  ('씨발', 'exact'), ('시발', 'exact'), ('개새끼', 'exact'), ('병신', 'exact'),
  ('지랄', 'exact'), ('존나', 'exact'), ('ㅅㅂ', 'exact'), ('ㅂㅅ', 'exact'), ('ㅈㄹ', 'exact'),
  -- Thai
  ('เหี้ย', 'exact'), ('ควย', 'exact'), ('เย็ด', 'exact'), ('ส้นตีน', 'exact')
on conflict (word) do nothing;

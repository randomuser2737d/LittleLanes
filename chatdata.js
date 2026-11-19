/*!
 * Little Lanes chat data: phrase catalog, emoji set and local tile search.
 * Players never type messages. They tap whole phrase tiles (and optional emoji).
 * The search box only FINDS tiles on this device; the typed text is never
 * sent, stored, logged or returned. A message is {t:[tileIds], s:[slotIds], e:[emojiIds]}.
 *
 * IDs are PERMANENT (stored inside messages). Never renumber, reuse or delete an id.
 * New tiles get the next free number. Every new tile needs human review of the phrase
 * and of every combination with its slot list.
 */
(function (root) {
  'use strict';

  var CATS = [
    {id:"greet",name:"Hi & bye",icon:"👋"},
    {id:"answer",name:"Yes & no",icon:"✅"},
    {id:"play",name:"Play together",icon:"🎮"},
    {id:"duel",name:"Duels",icon:"⚡"},
    {id:"coop",name:"Teamwork",icon:"🤝"},
    {id:"daily",name:"Daily & weekly",icon:"📅"},
    {id:"build",name:"Building tips",icon:"🛣️"},
    {id:"cheer",name:"Cheers & praise",icon:"🌟"},
    {id:"react",name:"Reactions",icon:"😮"},
    {id:"feel",name:"Feelings",icon:"😊"},
    {id:"ask",name:"Questions",icon:"❓"},
    {id:"time",name:"Time & plans",icon:"⏰"},
    {id:"thanks",name:"Thanks & sorry",icon:"🙏"},
    {id:"city",name:"Cities & maps",icon:"🏙️"},
    {id:"maker",name:"Map maker",icon:"🗺️"},
    {id:"fun",name:"Fun & silly",icon:"🎉"},
    {id:"help",name:"Help & hints",icon:"🧩"}
  ];

  // id, cat, text, slot, keys, end (end = the phrase finishes a sentence)
  var TILES = [
    {id:1,cat:"greet",text:"Hi!",slot:null,keys:["hello","hey","yo","hiya","sup","hi there","howdy"],end:true},
    {id:2,cat:"greet",text:"Hello!",slot:null,keys:["hi","hey","greetings","helo","hullo"],end:true},
    {id:3,cat:"greet",text:"Hey there!",slot:null,keys:["hi","hello","hey","yo"],end:true},
    {id:4,cat:"greet",text:"Good morning!",slot:null,keys:["morning","gm"],end:true},
    {id:5,cat:"greet",text:"Good evening!",slot:null,keys:["evening"],end:true},
    {id:6,cat:"greet",text:"Good night!",slot:null,keys:["night","gn","nite","sleep well"],end:true},
    {id:7,cat:"greet",text:"Welcome!",slot:null,keys:["welcome","glad"],end:true},
    {id:8,cat:"greet",text:"Welcome back!",slot:null,keys:["back","again"],end:true},
    {id:9,cat:"greet",text:"Nice to see you!",slot:null,keys:["hi","glad","hello"],end:true},
    {id:10,cat:"greet",text:"Hello, everyone!",slot:null,keys:["hi all","hey all","everybody","team","hello all","hey guys"],end:true},
    {id:11,cat:"greet",text:"Hi, friends!",slot:null,keys:["hello friends","hey friends","pals","hi guys"],end:true},
    {id:12,cat:"greet",text:"Bye!",slot:null,keys:["goodbye","cya","see ya","bai","gtg"],end:true},
    {id:13,cat:"greet",text:"Bye for now!",slot:null,keys:["goodbye","later","cya","bye bye"],end:true},
    {id:14,cat:"greet",text:"See you later!",slot:null,keys:["later","cya","see ya","laters"],end:true},
    {id:15,cat:"greet",text:"See you soon!",slot:null,keys:["soon","cya"],end:true},
    {id:16,cat:"greet",text:"Have a great day!",slot:null,keys:["nice day","good day"],end:true},
    {id:17,cat:"greet",text:"Good luck!",slot:null,keys:["gl","luck","best wishes"],end:true},
    {id:18,cat:"greet",text:"Have fun!",slot:null,keys:["hf","enjoy","fun"],end:true},
    {id:19,cat:"answer",text:"Yes!",slot:null,keys:["yeah","yep","yup","y","yea","ya","yas"],end:true},
    {id:20,cat:"answer",text:"Yes, please!",slot:null,keys:["yeah please","yep please","pls","plz"],end:true},
    {id:21,cat:"answer",text:"No",slot:null,keys:["nope","nah","n","nay"],end:false},
    {id:22,cat:"answer",text:"No thanks",slot:null,keys:["nah thanks","no thank you","nty"],end:false},
    {id:23,cat:"answer",text:"No, thank you!",slot:null,keys:["no thanks","nope thanks"],end:true},
    {id:24,cat:"answer",text:"Maybe",slot:null,keys:["perhaps","mayb","possibly","idk"],end:false},
    {id:25,cat:"answer",text:"Okay",slot:null,keys:["ok","k","okie","kk","alright","fine","okey"],end:false},
    {id:26,cat:"answer",text:"Sure!",slot:null,keys:["ok","okay","of course","yes","sure thing"],end:true},
    {id:27,cat:"answer",text:"Of course!",slot:null,keys:["sure","yes","definitely","absolutely"],end:true},
    {id:28,cat:"answer",text:"I think so",slot:null,keys:["probably","yes","guess so"],end:false},
    {id:29,cat:"answer",text:"I don't think so",slot:null,keys:["nope","no","probably not"],end:false},
    {id:30,cat:"answer",text:"Not right now",slot:null,keys:["later","not now","busy"],end:false},
    {id:31,cat:"answer",text:"Not yet",slot:null,keys:["no","wait"],end:false},
    {id:32,cat:"answer",text:"Maybe later",slot:null,keys:["later","not now","another time"],end:false},
    {id:33,cat:"answer",text:"I'm not sure",slot:null,keys:["idk","dunno","unsure","don't know"],end:false},
    {id:34,cat:"answer",text:"I don't know",slot:null,keys:["idk","dunno","no idea"],end:false},
    {id:35,cat:"answer",text:"I agree!",slot:null,keys:["agree","same","yes","true"],end:true},
    {id:36,cat:"answer",text:"Good idea!",slot:null,keys:["agree","great idea","yes"],end:true},
    {id:37,cat:"answer",text:"Sounds good!",slot:null,keys:["ok","yes","great","agree","sounds great"],end:true},
    {id:38,cat:"answer",text:"That works!",slot:null,keys:["ok","yes","fine","works for me"],end:true},
    {id:39,cat:"answer",text:"That's okay",slot:null,keys:["no problem","fine","np"],end:false},
    {id:40,cat:"answer",text:"No problem!",slot:null,keys:["np","its ok","all good"],end:true},
    {id:41,cat:"answer",text:"All good!",slot:null,keys:["fine","ok","np","good"],end:true},
    {id:42,cat:"answer",text:"Me too!",slot:null,keys:["same","also","mee too"],end:true},
    {id:43,cat:"answer",text:"Same here!",slot:null,keys:["me too","same"],end:true},
    {id:44,cat:"play",text:"Want to play?",slot:null,keys:["play","game","join","wanna play","wanna","lets play"],end:true},
    {id:45,cat:"play",text:"Let's play!",slot:null,keys:["play","game","lets go","lets play"],end:true},
    {id:46,cat:"play",text:"Let's play {city}!",slot:"city",keys:["play","city","map","lets play"],end:true},
    {id:47,cat:"play",text:"Can we play {city}?",slot:"city",keys:["play","city","map"],end:true},
    {id:48,cat:"play",text:"Play {city} next?",slot:"city",keys:["next","city","map"],end:true},
    {id:49,cat:"play",text:"Let's try {mode}!",slot:"mode",keys:["mode","play","try"],end:true},
    {id:50,cat:"play",text:"Want to try {mode}?",slot:"mode",keys:["mode","play","try"],end:true},
    {id:51,cat:"play",text:"Let's do {mode}!",slot:"mode",keys:["mode","play"],end:true},
    {id:52,cat:"play",text:"Let's play {time}!",slot:"time",keys:["play","when","schedule"],end:true},
    {id:53,cat:"play",text:"Want to play {time}?",slot:"time",keys:["play","when","schedule"],end:true},
    {id:54,cat:"play",text:"Can we play {time}?",slot:"time",keys:["play","when","schedule"],end:true},
    {id:55,cat:"play",text:"Join my room",slot:null,keys:["room","party","come","join me","lobby"],end:false},
    {id:56,cat:"play",text:"I'll make a room",slot:null,keys:["create room","host","room","lobby"],end:false},
    {id:57,cat:"play",text:"Can I join your room?",slot:null,keys:["room","join","enter","lobby"],end:true},
    {id:58,cat:"play",text:"Come join us!",slot:null,keys:["join","room","party","come here"],end:true},
    {id:59,cat:"play",text:"Let's make a party",slot:null,keys:["party","coop","group","team"],end:false},
    {id:60,cat:"play",text:"Want to join a party?",slot:null,keys:["party","group","coop","team"],end:true},
    {id:61,cat:"play",text:"I'm ready!",slot:null,keys:["ready","rdy","set"],end:true},
    {id:62,cat:"play",text:"Are you ready?",slot:null,keys:["ready","rdy"],end:true},
    {id:63,cat:"play",text:"Ready to start?",slot:null,keys:["ready","begin","rdy"],end:true},
    {id:64,cat:"play",text:"Let's start!",slot:null,keys:["start","begin","go"],end:true},
    {id:65,cat:"play",text:"Let's go!",slot:null,keys:["go","start","lets go"],end:true},
    {id:66,cat:"play",text:"Wait for me!",slot:null,keys:["wait","hold on","wait up"],end:true},
    {id:67,cat:"play",text:"One moment, please",slot:null,keys:["wait","sec","second","pls wait"],end:false},
    {id:68,cat:"play",text:"Pick a map!",slot:null,keys:["map","city","choose"],end:true},
    {id:69,cat:"play",text:"You pick!",slot:null,keys:["choose","your turn","your choice"],end:true},
    {id:70,cat:"play",text:"Let's play again!",slot:null,keys:["again","rematch","more","replay"],end:true},
    {id:71,cat:"duel",text:"Let's duel!",slot:null,keys:["duel","vs","versus","match"],end:true},
    {id:72,cat:"duel",text:"Ready for a duel?",slot:null,keys:["duel","ready","vs","match"],end:true},
    {id:73,cat:"duel",text:"Good luck in the duel!",slot:null,keys:["gl","duel","luck"],end:true},
    {id:74,cat:"duel",text:"Good game!",slot:null,keys:["gg","gj","well played","wp","goodgame"],end:true},
    {id:75,cat:"duel",text:"Nice duel!",slot:null,keys:["gg","duel","good duel"],end:true},
    {id:76,cat:"duel",text:"That was a fun duel!",slot:null,keys:["duel","fun","gg"],end:true},
    {id:77,cat:"duel",text:"Rematch?",slot:null,keys:["again","rematch","rm","another"],end:true},
    {id:78,cat:"duel",text:"One more duel?",slot:null,keys:["again","rematch","another"],end:true},
    {id:79,cat:"duel",text:"Best of three?",slot:null,keys:["best","series","rematch"],end:true},
    {id:80,cat:"duel",text:"Let's try Survival!",slot:null,keys:["survival","mode","duel"],end:true},
    {id:81,cat:"duel",text:"Let's try Sprint!",slot:null,keys:["sprint","mode","duel","race"],end:true},
    {id:82,cat:"duel",text:"I like Survival",slot:null,keys:["survival","mode","duel"],end:false},
    {id:83,cat:"duel",text:"I like Sprint",slot:null,keys:["sprint","mode","duel"],end:false},
    {id:84,cat:"duel",text:"Ready when you are!",slot:null,keys:["ready","rdy"],end:true},
    {id:85,cat:"duel",text:"That was close!",slot:null,keys:["close","so close","nearly","tight"],end:true},
    {id:86,cat:"duel",text:"You played well!",slot:null,keys:["gg","nice","well played","good game"],end:true},
    {id:87,cat:"duel",text:"Well played!",slot:null,keys:["wp","gg","good game"],end:true},
    {id:88,cat:"duel",text:"Great comeback!",slot:null,keys:["comeback","wow"],end:true},
    {id:89,cat:"duel",text:"What a finish!",slot:null,keys:["finish","end","wow"],end:true},
    {id:90,cat:"duel",text:"Watch the timer!",slot:null,keys:["timer","clock","time"],end:true},
    {id:91,cat:"duel",text:"May the best builder win!",slot:null,keys:["gl","luck","best"],end:true},
    {id:92,cat:"duel",text:"Thanks for the duel!",slot:null,keys:["gg","thx","ty","duel"],end:true},
    {id:93,cat:"duel",text:"I'll try again!",slot:null,keys:["retry","again","next time"],end:true},
    {id:94,cat:"duel",text:"Go for it!",slot:null,keys:["go","you can do it","try"],end:true},
    {id:95,cat:"coop",text:"Let's team up!",slot:null,keys:["teamwork","together","partner","coop","co-op"],end:true},
    {id:96,cat:"coop",text:"Help me!",slot:null,keys:["help","assist","helpme","pls help","plz help"],end:true},
    {id:97,cat:"coop",text:"I can help!",slot:null,keys:["assist","help"],end:true},
    {id:98,cat:"coop",text:"Need a hand?",slot:null,keys:["help","assist"],end:true},
    {id:99,cat:"coop",text:"Can you help me?",slot:null,keys:["help","assist","pls help"],end:true},
    {id:100,cat:"coop",text:"Need more {thing}",slot:"thing",keys:["build","need","more"],end:false},
    {id:101,cat:"coop",text:"I'll build {thing}",slot:"thing",keys:["build","make"],end:false},
    {id:102,cat:"coop",text:"You build {thing}",slot:"thing",keys:["build","make"],end:false},
    {id:103,cat:"coop",text:"Let's build more {thing}",slot:"thing",keys:["build","make","more"],end:false},
    {id:104,cat:"coop",text:"We need {thing}!",slot:"thing",keys:["build","need"],end:true},
    {id:105,cat:"coop",text:"I'll build here",slot:null,keys:["build","here"],end:false},
    {id:106,cat:"coop",text:"You build there",slot:null,keys:["build","there"],end:false},
    {id:107,cat:"coop",text:"I'll do the left side",slot:null,keys:["left","side","build"],end:false},
    {id:108,cat:"coop",text:"I'll do the right side",slot:null,keys:["right","side","build"],end:false},
    {id:109,cat:"coop",text:"Let's connect the roads",slot:null,keys:["connect","link","roads"],end:false},
    {id:110,cat:"coop",text:"Let's plan first",slot:null,keys:["plan","think"],end:false},
    {id:111,cat:"coop",text:"Watch the red timer!",slot:null,keys:["timer","red","careful","warning"],end:true},
    {id:112,cat:"coop",text:"Fix the red timer first!",slot:null,keys:["timer","red","fix","priority"],end:true},
    {id:113,cat:"coop",text:"Almost there!",slot:null,keys:["nearly","close","soon"],end:true},
    {id:114,cat:"coop",text:"We did it!",slot:null,keys:["win","yay","done","finished","we won"],end:true},
    {id:115,cat:"coop",text:"Great teamwork!",slot:null,keys:["team","teamwork","gg"],end:true},
    {id:116,cat:"coop",text:"We make a great team!",slot:null,keys:["team","teamwork"],end:true},
    {id:117,cat:"coop",text:"Done building!",slot:null,keys:["finished","done","complete"],end:true},
    {id:118,cat:"coop",text:"Your turn!",slot:null,keys:["go","turn","you go"],end:true},
    {id:119,cat:"coop",text:"My turn!",slot:null,keys:["turn","my go"],end:true},
    {id:120,cat:"coop",text:"Let's do it together!",slot:null,keys:["together","team"],end:true},
    {id:121,cat:"coop",text:"Don't give up!",slot:null,keys:["keep going","you can do it","never give up"],end:true},
    {id:122,cat:"coop",text:"Keep going!",slot:null,keys:["continue","go on"],end:true},
    {id:123,cat:"daily",text:"Did you try the daily?",slot:null,keys:["daily","challenge","today"],end:true},
    {id:124,cat:"daily",text:"I did the daily!",slot:null,keys:["daily","challenge","done"],end:true},
    {id:125,cat:"daily",text:"Today's challenge is tricky",slot:null,keys:["hard","daily","tough"],end:false},
    {id:126,cat:"daily",text:"Today's challenge is easy!",slot:null,keys:["daily","simple"],end:true},
    {id:127,cat:"daily",text:"Want to try the daily?",slot:null,keys:["daily","challenge","play"],end:true},
    {id:128,cat:"daily",text:"Let's do the daily together!",slot:null,keys:["daily","team","challenge"],end:true},
    {id:129,cat:"daily",text:"Let's do the daily {time}!",slot:"time",keys:["daily","when","schedule"],end:true},
    {id:130,cat:"daily",text:"Did you try the weekly?",slot:null,keys:["weekly","challenge","week"],end:true},
    {id:131,cat:"daily",text:"I finished the weekly!",slot:null,keys:["weekly","done","complete"],end:true},
    {id:132,cat:"daily",text:"The weekly is tricky",slot:null,keys:["weekly","hard","tough"],end:false},
    {id:133,cat:"daily",text:"The weekly is fun!",slot:null,keys:["weekly","fun"],end:true},
    {id:134,cat:"daily",text:"Let's do the weekly together!",slot:null,keys:["weekly","team","challenge"],end:true},
    {id:135,cat:"daily",text:"Let's do the weekly {time}!",slot:"time",keys:["weekly","when","schedule"],end:true},
    {id:136,cat:"daily",text:"I'm going for a streak!",slot:null,keys:["streak","daily","days in a row"],end:true},
    {id:137,cat:"daily",text:"Nice streak!",slot:null,keys:["streak","wow","gj"],end:true},
    {id:138,cat:"daily",text:"New daily tomorrow!",slot:null,keys:["new","daily","challenge"],end:true},
    {id:139,cat:"daily",text:"I'll try again tomorrow",slot:null,keys:["retry","again","daily"],end:false},
    {id:140,cat:"daily",text:"This week's map looks fun!",slot:null,keys:["weekly","map","week"],end:true},
    {id:141,cat:"daily",text:"I got a good score today!",slot:null,keys:["score","daily","points"],end:true},
    {id:142,cat:"build",text:"Try a roundabout",slot:null,keys:["circle","junction","roundabouts"],end:false},
    {id:143,cat:"build",text:"Roundabouts help a lot",slot:null,keys:["circle","junction","roundabouts"],end:false},
    {id:144,cat:"build",text:"Good spot for a roundabout",slot:null,keys:["circle","junction","place"],end:false},
    {id:145,cat:"build",text:"Use a bridge here",slot:null,keys:["bridge","river","cross"],end:false},
    {id:146,cat:"build",text:"Try a bridge!",slot:null,keys:["bridge","river","cross"],end:true},
    {id:147,cat:"build",text:"Bridges are great!",slot:null,keys:["bridge","river"],end:true},
    {id:148,cat:"build",text:"Cross the river with a bridge",slot:null,keys:["water","river","bridge","cross"],end:false},
    {id:149,cat:"build",text:"Use a tunnel here",slot:null,keys:["tunnel","hill","mountain"],end:false},
    {id:150,cat:"build",text:"Try a tunnel!",slot:null,keys:["tunnel","hill","mountain"],end:true},
    {id:151,cat:"build",text:"Tunnels save space",slot:null,keys:["tunnel","hill"],end:false},
    {id:152,cat:"build",text:"Tunnels go under hills",slot:null,keys:["tunnel","hill","mountain"],end:false},
    {id:153,cat:"build",text:"Build a motorway",slot:null,keys:["highway","freeway","fast road"],end:false},
    {id:154,cat:"build",text:"Try a motorway!",slot:null,keys:["highway","freeway","fast road"],end:true},
    {id:155,cat:"build",text:"Motorways are fast!",slot:null,keys:["highway","freeway","speed"],end:true},
    {id:156,cat:"build",text:"Use traffic lights",slot:null,keys:["lights","signal","stoplight"],end:false},
    {id:157,cat:"build",text:"Add a traffic light",slot:null,keys:["lights","signal","stoplight"],end:false},
    {id:158,cat:"build",text:"Traffic lights help here",slot:null,keys:["lights","signal","stoplight"],end:false},
    {id:159,cat:"build",text:"Upgrade the roads",slot:null,keys:["upgrades","improve","better"],end:false},
    {id:160,cat:"build",text:"Upgrades are worth it!",slot:null,keys:["upgrade","improve"],end:true},
    {id:161,cat:"build",text:"Upgrade first, then build",slot:null,keys:["upgrade","order","tip"],end:false},
    {id:162,cat:"build",text:"Keep roads short",slot:null,keys:["short","small","tip"],end:false},
    {id:163,cat:"build",text:"Keep roads simple",slot:null,keys:["simple","easy","tip"],end:false},
    {id:164,cat:"build",text:"Plan ahead!",slot:null,keys:["plan","think","tip"],end:true},
    {id:165,cat:"build",text:"Leave some space",slot:null,keys:["room","gap","tip"],end:false},
    {id:166,cat:"build",text:"Connect the houses first",slot:null,keys:["houses","connect","first"],end:false},
    {id:167,cat:"build",text:"Connect the workplaces",slot:null,keys:["workplaces","connect","jobs"],end:false},
    {id:168,cat:"build",text:"Link houses to workplaces",slot:null,keys:["houses","workplaces","connect"],end:false},
    {id:169,cat:"build",text:"Watch for traffic jams",slot:null,keys:["jam","traffic","careful"],end:false},
    {id:170,cat:"build",text:"Fix the busy spot",slot:null,keys:["jam","busy","traffic"],end:false},
    {id:171,cat:"build",text:"Add a shortcut",slot:null,keys:["shortcuts","quick","road"],end:false},
    {id:172,cat:"build",text:"Shortcuts help!",slot:null,keys:["shortcut","quick"],end:true},
    {id:173,cat:"build",text:"Build near the center",slot:null,keys:["middle","centre","central"],end:false},
    {id:174,cat:"build",text:"Keep traffic moving!",slot:null,keys:["flow","jam","moving"],end:true},
    {id:175,cat:"build",text:"Try {thing} here!",slot:"thing",keys:["build","suggest","tip"],end:true},
    {id:176,cat:"build",text:"Don't forget {thing}!",slot:"thing",keys:["build","remember","tip"],end:true},
    {id:177,cat:"build",text:"Use more {thing}",slot:"thing",keys:["build","suggest","tip"],end:false},
    {id:178,cat:"build",text:"I like {thing}",slot:"thing",keys:["build","favorite","fav"],end:false},
    {id:179,cat:"build",text:"That's a good spot",slot:null,keys:["place","location","here"],end:false},
    {id:180,cat:"cheer",text:"Nice one!",slot:null,keys:["nice","ni","gj","nicee"],end:true},
    {id:181,cat:"cheer",text:"Great job!",slot:null,keys:["gj","good job","well done"],end:true},
    {id:182,cat:"cheer",text:"Good job!",slot:null,keys:["gj","great job","well done"],end:true},
    {id:183,cat:"cheer",text:"Well done!",slot:null,keys:["wd","gj","great job"],end:true},
    {id:184,cat:"cheer",text:"Awesome!",slot:null,keys:["awsome","cool","great","awesom"],end:true},
    {id:185,cat:"cheer",text:"Amazing!",slot:null,keys:["wow","great","awesome"],end:true},
    {id:186,cat:"cheer",text:"Fantastic!",slot:null,keys:["great","awesome","wow"],end:true},
    {id:187,cat:"cheer",text:"Nice road!",slot:null,keys:["roads","nice","good"],end:true},
    {id:188,cat:"cheer",text:"Nice city!",slot:null,keys:["city","nice","good"],end:true},
    {id:189,cat:"cheer",text:"Cool design!",slot:null,keys:["design","cool","nice"],end:true},
    {id:190,cat:"cheer",text:"Beautiful layout!",slot:null,keys:["pretty","layout","map","nice"],end:true},
    {id:191,cat:"cheer",text:"Smart move!",slot:null,keys:["clever","smart","nice"],end:true},
    {id:192,cat:"cheer",text:"That was clever!",slot:null,keys:["smart","clever","nice"],end:true},
    {id:193,cat:"cheer",text:"Great idea!",slot:null,keys:["idea","smart","nice"],end:true},
    {id:194,cat:"cheer",text:"You're getting better!",slot:null,keys:["improving","improve","better"],end:true},
    {id:195,cat:"cheer",text:"You're really good!",slot:null,keys:["skilled","good","great"],end:true},
    {id:196,cat:"cheer",text:"You're a great builder!",slot:null,keys:["builder","build","skilled"],end:true},
    {id:197,cat:"cheer",text:"Nice try!",slot:null,keys:["try","good try"],end:true},
    {id:198,cat:"cheer",text:"Keep it up!",slot:null,keys:["keep going","continue"],end:true},
    {id:199,cat:"cheer",text:"Way to go!",slot:null,keys:["gj","great"],end:true},
    {id:200,cat:"cheer",text:"You did it!",slot:null,keys:["yay","win","done","nice"],end:true},
    {id:201,cat:"cheer",text:"Congratulations!",slot:null,keys:["congrats","gratz","grats"],end:true},
    {id:202,cat:"cheer",text:"High score!",slot:null,keys:["points","record","best"],end:true},
    {id:203,cat:"cheer",text:"I like your map!",slot:null,keys:["map","nice","cool"],end:true},
    {id:204,cat:"cheer",text:"I like your city!",slot:null,keys:["city","nice","cool"],end:true},
    {id:205,cat:"cheer",text:"That looks cool!",slot:null,keys:["cool","nice","looks great"],end:true},
    {id:206,cat:"cheer",text:"Road master!",slot:null,keys:["pro","expert","master","builder"],end:true},
    {id:207,cat:"react",text:"Wow!",slot:null,keys:["woah","whoa","omg","wowie"],end:true},
    {id:208,cat:"react",text:"Whoa!",slot:null,keys:["wow","woah","omg"],end:true},
    {id:209,cat:"react",text:"Oops!",slot:null,keys:["oopsie","whoops","mistake"],end:true},
    {id:210,cat:"react",text:"Phew!",slot:null,keys:["whew","relief","close"],end:true},
    {id:211,cat:"react",text:"So close!",slot:null,keys:["close","almost","nearly"],end:true},
    {id:212,cat:"react",text:"Haha!",slot:null,keys:["lol","lmao","hehe","funny","hah"],end:true},
    {id:213,cat:"react",text:"That's funny!",slot:null,keys:["lol","funny","haha"],end:true},
    {id:214,cat:"react",text:"Yay!",slot:null,keys:["woohoo","hooray","yippee"],end:true},
    {id:215,cat:"react",text:"Woohoo!",slot:null,keys:["yay","hooray","yippee"],end:true},
    {id:216,cat:"react",text:"Hooray!",slot:null,keys:["yay","woohoo","hurray"],end:true},
    {id:217,cat:"react",text:"Hmm...",slot:null,keys:["thinking","hmm","hm"],end:true},
    {id:218,cat:"react",text:"Oh no!",slot:null,keys:["uh oh","oops","uhoh"],end:true},
    {id:219,cat:"react",text:"Uh oh!",slot:null,keys:["oh no","oops","uhoh"],end:true},
    {id:220,cat:"react",text:"Ooh, nice!",slot:null,keys:["oooh","nice","cool"],end:true},
    {id:221,cat:"react",text:"I see!",slot:null,keys:["got it","oh i see","understand"],end:true},
    {id:222,cat:"react",text:"Got it!",slot:null,keys:["ok","understood","understand"],end:true},
    {id:223,cat:"react",text:"Whew, that was close!",slot:null,keys:["phew","close","relief"],end:true},
    {id:224,cat:"react",text:"Nailed it!",slot:null,keys:["perfect","success","yes"],end:true},
    {id:225,cat:"react",text:"Cool!",slot:null,keys:["nice","neat","kool"],end:true},
    {id:226,cat:"react",text:"Neat!",slot:null,keys:["cool","nice"],end:true},
    {id:227,cat:"react",text:"Nice!",slot:null,keys:["cool","neat","good"],end:true},
    {id:228,cat:"react",text:"That was wild!",slot:null,keys:["crazy","wow","wild"],end:true},
    {id:229,cat:"react",text:"That was fast!",slot:null,keys:["quick","speedy","zoom"],end:true},
    {id:230,cat:"react",text:"Ta-da!",slot:null,keys:["tada","tadaa","done"],end:true},
    {id:231,cat:"feel",text:"I'm having fun!",slot:null,keys:["fun","enjoying","enjoy"],end:true},
    {id:232,cat:"feel",text:"I'm happy!",slot:null,keys:["glad","joy","good mood"],end:true},
    {id:233,cat:"feel",text:"I'm excited!",slot:null,keys:["hyped","pumped","excite"],end:true},
    {id:234,cat:"feel",text:"I'm tired",slot:null,keys:["sleepy","sleep","tird"],end:false},
    {id:235,cat:"feel",text:"I'm a little sleepy",slot:null,keys:["tired","sleep"],end:false},
    {id:236,cat:"feel",text:"I'm learning!",slot:null,keys:["learn","practice","improve"],end:true},
    {id:237,cat:"feel",text:"I'm curious",slot:null,keys:["wonder","interested"],end:false},
    {id:238,cat:"feel",text:"I'm proud of this!",slot:null,keys:["proud","happy"],end:true},
    {id:239,cat:"feel",text:"I'm a bit nervous",slot:null,keys:["nervous","worried"],end:false},
    {id:240,cat:"feel",text:"I'm stuck",slot:null,keys:["stuck","help","hard"],end:false},
    {id:241,cat:"feel",text:"I'm confused",slot:null,keys:["lost","huh","dont get it"],end:false},
    {id:242,cat:"feel",text:"That was hard",slot:null,keys:["difficult","tough","hard"],end:false},
    {id:243,cat:"feel",text:"That was easy!",slot:null,keys:["simple","easy","ez"],end:true},
    {id:244,cat:"feel",text:"That was tricky",slot:null,keys:["tricky","tough","hard"],end:false},
    {id:245,cat:"feel",text:"This is fun!",slot:null,keys:["fun","enjoy"],end:true},
    {id:246,cat:"feel",text:"This is tricky!",slot:null,keys:["hard","tough","tricky"],end:true},
    {id:247,cat:"feel",text:"This is exciting!",slot:null,keys:["exciting","fun","hype"],end:true},
    {id:248,cat:"feel",text:"I'm trying my best!",slot:null,keys:["try","effort"],end:true},
    {id:249,cat:"feel",text:"I feel great!",slot:null,keys:["good","happy"],end:true},
    {id:250,cat:"feel",text:"I'm having a great time!",slot:null,keys:["fun","great","good"],end:true},
    {id:251,cat:"feel",text:"I'm glad we played!",slot:null,keys:["glad","happy","fun"],end:true},
    {id:252,cat:"feel",text:"I need a break",slot:null,keys:["rest","pause","tired"],end:false},
    {id:253,cat:"feel",text:"Let's take a break",slot:null,keys:["rest","pause","break"],end:false},
    {id:254,cat:"ask",text:"Which city?",slot:null,keys:["map","city","pick"],end:true},
    {id:255,cat:"ask",text:"Which city next?",slot:null,keys:["map","next","city"],end:true},
    {id:256,cat:"ask",text:"Which map next?",slot:null,keys:["map","next","city"],end:true},
    {id:257,cat:"ask",text:"What week are you on?",slot:null,keys:["week","progress","level"],end:true},
    {id:258,cat:"ask",text:"What should I build next?",slot:null,keys:["build","next","idea"],end:true},
    {id:259,cat:"ask",text:"Is this a good spot?",slot:null,keys:["place","location","here"],end:true},
    {id:260,cat:"ask",text:"Do you like this map?",slot:null,keys:["map","like"],end:true},
    {id:261,cat:"ask",text:"What's your favorite city?",slot:null,keys:["fav","favourite","city"],end:true},
    {id:262,cat:"ask",text:"What's your favorite mode?",slot:null,keys:["fav","favourite","mode"],end:true},
    {id:263,cat:"ask",text:"How did you do that?",slot:null,keys:["how","trick","tip"],end:true},
    {id:264,cat:"ask",text:"How do I do that?",slot:null,keys:["how","trick","tip"],end:true},
    {id:265,cat:"ask",text:"Can you show me?",slot:null,keys:["show","teach","how"],end:true},
    {id:266,cat:"ask",text:"Want to team up?",slot:null,keys:["team","coop","together","party"],end:true},
    {id:267,cat:"ask",text:"Want to try again?",slot:null,keys:["again","retry","another"],end:true},
    {id:268,cat:"ask",text:"Want to try a new map?",slot:null,keys:["map","new","city"],end:true},
    {id:269,cat:"ask",text:"Is it my turn?",slot:null,keys:["turn","my go"],end:true},
    {id:270,cat:"ask",text:"Whose turn is it?",slot:null,keys:["turn","who"],end:true},
    {id:271,cat:"ask",text:"Did you see that?",slot:null,keys:["see","look","watch"],end:true},
    {id:272,cat:"ask",text:"Can I try?",slot:null,keys:["try","play","turn"],end:true},
    {id:273,cat:"ask",text:"Can we try again?",slot:null,keys:["again","retry"],end:true},
    {id:274,cat:"ask",text:"How are you?",slot:null,keys:["hru","how r u","hows"],end:true},
    {id:275,cat:"ask",text:"Have you tried {city}?",slot:"city",keys:["city","map","tried"],end:true},
    {id:276,cat:"ask",text:"Have you tried {mode}?",slot:"mode",keys:["mode","tried","play"],end:true},
    {id:277,cat:"ask",text:"Should I build {thing}?",slot:"thing",keys:["build","idea","should"],end:true},
    {id:278,cat:"ask",text:"Should we build {thing}?",slot:"thing",keys:["build","idea","should"],end:true},
    {id:279,cat:"ask",text:"Do you like {thing}?",slot:"thing",keys:["like","favorite","fav"],end:true},
    {id:280,cat:"ask",text:"Do you like {city}?",slot:"city",keys:["like","city","map"],end:true},
    {id:281,cat:"time",text:"Be right back",slot:null,keys:["brb","wait","afk"],end:false},
    {id:282,cat:"time",text:"Back in a minute",slot:null,keys:["brb","wait","soon"],end:false},
    {id:283,cat:"time",text:"One more game?",slot:null,keys:["again","more","another"],end:true},
    {id:284,cat:"time",text:"One more round?",slot:null,keys:["again","more","another"],end:true},
    {id:285,cat:"time",text:"Gotta go!",slot:null,keys:["gtg","got to go","bye","leaving"],end:true},
    {id:286,cat:"time",text:"I have to go soon",slot:null,keys:["gtg","leave","bye"],end:false},
    {id:287,cat:"time",text:"See you {time}!",slot:"time",keys:["cya","see ya","later"],end:true},
    {id:288,cat:"time",text:"Let's play again {time}!",slot:"time",keys:["again","when","schedule"],end:true},
    {id:289,cat:"time",text:"Maybe {time}?",slot:"time",keys:["when","perhaps","schedule"],end:true},
    {id:290,cat:"time",text:"See you tomorrow!",slot:null,keys:["tomorrow","cya","bye"],end:true},
    {id:291,cat:"time",text:"See you next time!",slot:null,keys:["cya","bye","later"],end:true},
    {id:292,cat:"time",text:"See you next week!",slot:null,keys:["cya","bye","week"],end:true},
    {id:293,cat:"time",text:"I'll be back soon",slot:null,keys:["brb","soon","wait"],end:false},
    {id:294,cat:"time",text:"I'll be back later",slot:null,keys:["later","soon","bye"],end:false},
    {id:295,cat:"time",text:"Hold on!",slot:null,keys:["wait","hang on","hold up"],end:true},
    {id:296,cat:"time",text:"Just a second!",slot:null,keys:["sec","wait","second"],end:true},
    {id:297,cat:"time",text:"Almost done!",slot:null,keys:["nearly","finishing","soon"],end:true},
    {id:298,cat:"time",text:"Time for a break",slot:null,keys:["rest","pause","break"],end:false},
    {id:299,cat:"time",text:"That's all for today",slot:null,keys:["done","stop","bye"],end:false},
    {id:300,cat:"time",text:"Last game!",slot:null,keys:["final","last","end"],end:true},
    {id:301,cat:"time",text:"Let's play again tomorrow",slot:null,keys:["tomorrow","again","schedule"],end:false},
    {id:302,cat:"time",text:"Let's play next week",slot:null,keys:["next week","again","schedule"],end:false},
    {id:303,cat:"time",text:"Can we play again later?",slot:null,keys:["later","again","schedule"],end:true},
    {id:304,cat:"thanks",text:"Thanks!",slot:null,keys:["thx","ty","thank you","tysm","thanks","thankyou","thnx"],end:true},
    {id:305,cat:"thanks",text:"Thank you!",slot:null,keys:["thx","ty","thanks","thankyou"],end:true},
    {id:306,cat:"thanks",text:"Thanks a lot!",slot:null,keys:["thx","ty","tysm","thanks"],end:true},
    {id:307,cat:"thanks",text:"Thanks for playing!",slot:null,keys:["thx","ty","gg"],end:true},
    {id:308,cat:"thanks",text:"Thanks for the help!",slot:null,keys:["ty","thx","help"],end:true},
    {id:309,cat:"thanks",text:"Thanks for the tip!",slot:null,keys:["ty","thx","tip"],end:true},
    {id:310,cat:"thanks",text:"Thanks, that helped!",slot:null,keys:["ty","thx","helped"],end:true},
    {id:311,cat:"thanks",text:"Thanks, I learned a lot!",slot:null,keys:["ty","thx","learn"],end:true},
    {id:312,cat:"thanks",text:"Thanks for helping!",slot:null,keys:["ty","thx","help"],end:true},
    {id:313,cat:"thanks",text:"Thanks for the fun game!",slot:null,keys:["gg","ty","thx"],end:true},
    {id:314,cat:"thanks",text:"You're welcome!",slot:null,keys:["yw","np","welcome"],end:true},
    {id:315,cat:"thanks",text:"No worries!",slot:null,keys:["np","all good","its ok"],end:true},
    {id:316,cat:"thanks",text:"Sorry!",slot:null,keys:["sry","sorryy","my mistake","soz"],end:true},
    {id:317,cat:"thanks",text:"I'm sorry",slot:null,keys:["sry","sorry","apologies"],end:false},
    {id:318,cat:"thanks",text:"Sorry, my mistake",slot:null,keys:["oops","my mistake","sry"],end:false},
    {id:319,cat:"thanks",text:"Sorry, I wasn't ready",slot:null,keys:["sry","not ready"],end:false},
    {id:320,cat:"thanks",text:"Sorry for the wait",slot:null,keys:["sry","late","waiting"],end:false},
    {id:321,cat:"thanks",text:"Excuse me!",slot:null,keys:["pardon","sorry"],end:true},
    {id:322,cat:"thanks",text:"It's okay!",slot:null,keys:["its ok","fine","np","no worries"],end:true},
    {id:323,cat:"thanks",text:"Don't worry!",slot:null,keys:["no worries","np","its ok"],end:true},
    {id:324,cat:"thanks",text:"That's alright!",slot:null,keys:["its ok","fine","np"],end:true},
    {id:325,cat:"thanks",text:"Glad I could help!",slot:null,keys:["help","happy","glad"],end:true},
    {id:326,cat:"thanks",text:"Happy to help!",slot:null,keys:["np","help","glad"],end:true},
    {id:327,cat:"city",text:"{city} is my favorite!",slot:"city",keys:["fav","favourite","city","map"],end:true},
    {id:328,cat:"city",text:"{city} is fun!",slot:"city",keys:["fun","city","map"],end:true},
    {id:329,cat:"city",text:"{city} looks great!",slot:"city",keys:["nice","pretty","city","map"],end:true},
    {id:330,cat:"city",text:"I like {city}!",slot:"city",keys:["like","city","map"],end:true},
    {id:331,cat:"city",text:"I want to try {city}!",slot:"city",keys:["try","play","city","map"],end:true},
    {id:332,cat:"city",text:"Let's build in {city}!",slot:"city",keys:["build","play","city","map"],end:true},
    {id:333,cat:"city",text:"Nice {city} map!",slot:"city",keys:["nice","city","map"],end:true},
    {id:334,cat:"city",text:"Let's unlock more cities!",slot:null,keys:["unlock","new","cities"],end:true},
    {id:335,cat:"city",text:"I unlocked a new city!",slot:null,keys:["unlock","new","city"],end:true},
    {id:336,cat:"city",text:"This city is busy!",slot:null,keys:["busy","crowded","city"],end:true},
    {id:337,cat:"city",text:"This city looks pretty",slot:null,keys:["pretty","nice","city"],end:false},
    {id:338,cat:"city",text:"Nice skyline!",slot:null,keys:["buildings","city","view"],end:true},
    {id:339,cat:"city",text:"Nice map!",slot:null,keys:["map","good","cool"],end:true},
    {id:340,cat:"city",text:"Cool map!",slot:null,keys:["map","nice","neat"],end:true},
    {id:341,cat:"city",text:"Fun map!",slot:null,keys:["map","fun"],end:true},
    {id:342,cat:"city",text:"Tricky map!",slot:null,keys:["map","hard","tough"],end:true},
    {id:343,cat:"city",text:"The map is crowded",slot:null,keys:["busy","full","map"],end:false},
    {id:344,cat:"city",text:"Maps with water are fun",slot:null,keys:["water","river","map","sea"],end:false},
    {id:345,cat:"city",text:"I like maps with rivers",slot:null,keys:["river","water","map"],end:false},
    {id:346,cat:"city",text:"I like big cities",slot:null,keys:["big","large","city"],end:false},
    {id:347,cat:"city",text:"Busy cities are fun!",slot:null,keys:["busy","crowded","city"],end:true},
    {id:348,cat:"city",text:"New map, new ideas!",slot:null,keys:["new","map","ideas"],end:true},
    {id:349,cat:"maker",text:"I made a map!",slot:null,keys:["maker","created","editor","made"],end:true},
    {id:350,cat:"maker",text:"I'm making a map!",slot:null,keys:["maker","creating","editor"],end:true},
    {id:351,cat:"maker",text:"Try my map!",slot:null,keys:["play","maker","editor"],end:true},
    {id:352,cat:"maker",text:"Want to try my map?",slot:null,keys:["play","maker","editor"],end:true},
    {id:353,cat:"maker",text:"Can I try your map?",slot:null,keys:["play","maker","editor"],end:true},
    {id:354,cat:"maker",text:"Your map is fun!",slot:null,keys:["map","nice","fun"],end:true},
    {id:355,cat:"maker",text:"Your map is creative!",slot:null,keys:["creative","map","cool"],end:true},
    {id:356,cat:"maker",text:"Nice map design!",slot:null,keys:["design","map","cool"],end:true},
    {id:357,cat:"maker",text:"I like how it flows",slot:null,keys:["flow","map","nice"],end:false},
    {id:358,cat:"maker",text:"Great use of space!",slot:null,keys:["space","map","smart"],end:true},
    {id:359,cat:"maker",text:"I added some water",slot:null,keys:["water","river","sea","map"],end:false},
    {id:360,cat:"maker",text:"I added some houses",slot:null,keys:["houses","build","map"],end:false},
    {id:361,cat:"maker",text:"I'm adding {thing}",slot:"thing",keys:["add","build","map"],end:false},
    {id:362,cat:"maker",text:"Let's make a map together",slot:null,keys:["together","maker","team"],end:false},
    {id:363,cat:"maker",text:"Map maker is fun!",slot:null,keys:["maker","editor","fun"],end:true},
    {id:364,cat:"maker",text:"Almost done with my map!",slot:null,keys:["nearly","finishing","map"],end:true},
    {id:365,cat:"maker",text:"My map is ready!",slot:null,keys:["done","finished","map"],end:true},
    {id:366,cat:"maker",text:"Is my map too hard?",slot:null,keys:["hard","difficulty","map"],end:true},
    {id:367,cat:"maker",text:"Is my map fun?",slot:null,keys:["fun","map","good"],end:true},
    {id:368,cat:"fun",text:"Traffic jam party!",slot:null,keys:["jam","party","cars"],end:true},
    {id:369,cat:"fun",text:"Beep beep!",slot:null,keys:["horn","honk","car"],end:true},
    {id:370,cat:"fun",text:"Beep beep, coming through!",slot:null,keys:["horn","honk","car"],end:true},
    {id:371,cat:"fun",text:"Honk honk!",slot:null,keys:["horn","beep","car"],end:true},
    {id:372,cat:"fun",text:"Vroom vroom!",slot:null,keys:["car","engine","zoom"],end:true},
    {id:373,cat:"fun",text:"Choo choo!",slot:null,keys:["train","toot","toy"],end:true},
    {id:374,cat:"fun",text:"Here we go!",slot:null,keys:["go","start","lets go"],end:true},
    {id:375,cat:"fun",text:"Buckle up!",slot:null,keys:["seatbelt","car","ready"],end:true},
    {id:376,cat:"fun",text:"Start your engines!",slot:null,keys:["engine","race","go"],end:true},
    {id:377,cat:"fun",text:"Let's roll!",slot:null,keys:["go","start","drive"],end:true},
    {id:378,cat:"fun",text:"Green lights ahead!",slot:null,keys:["go","lights","traffic"],end:true},
    {id:379,cat:"fun",text:"Smooth roads ahead!",slot:null,keys:["smooth","roads","easy"],end:true},
    {id:380,cat:"fun",text:"All roads lead to fun!",slot:null,keys:["roads","fun","happy"],end:true},
    {id:381,cat:"fun",text:"Roundabout we go!",slot:null,keys:["circle","roundabouts","fun"],end:true},
    {id:382,cat:"fun",text:"Everything is connected!",slot:null,keys:["connected","roads","link"],end:true},
    {id:383,cat:"fun",text:"The cars are happy!",slot:null,keys:["cars","happy","traffic"],end:true},
    {id:384,cat:"fun",text:"Cars everywhere!",slot:null,keys:["cars","busy","traffic"],end:true},
    {id:385,cat:"fun",text:"So many cars!",slot:null,keys:["cars","busy","traffic"],end:true},
    {id:386,cat:"fun",text:"I'm a road builder!",slot:null,keys:["builder","build","roads"],end:true},
    {id:387,cat:"fun",text:"Build, build, build!",slot:null,keys:["building","builder","roads"],end:true},
    {id:388,cat:"fun",text:"Tunnel time!",slot:null,keys:["tunnels","dark","fun"],end:true},
    {id:389,cat:"fun",text:"Over the bridge we go!",slot:null,keys:["bridges","cross","fun"],end:true},
    {id:390,cat:"fun",text:"Rainbow roads!",slot:null,keys:["rainbow","colors","roads"],end:true},
    {id:391,cat:"help",text:"How do I play?",slot:null,keys:["help","tutorial","how to","instructions"],end:true},
    {id:392,cat:"help",text:"How do I build a bridge?",slot:null,keys:["help","bridge","how to"],end:true},
    {id:393,cat:"help",text:"How do I make a roundabout?",slot:null,keys:["help","roundabout","how to"],end:true},
    {id:394,cat:"help",text:"How do I join a room?",slot:null,keys:["help","room","join","how to"],end:true},
    {id:395,cat:"help",text:"How do I start a duel?",slot:null,keys:["help","duel","how to"],end:true},
    {id:396,cat:"help",text:"I'm not sure how",slot:null,keys:["help","confused","how"],end:false},
    {id:397,cat:"help",text:"Can you show me how?",slot:null,keys:["show","teach","help"],end:true},
    {id:398,cat:"help",text:"Show me, please!",slot:null,keys:["show","teach","help","pls"],end:true},
    {id:399,cat:"help",text:"Try dragging a road",slot:null,keys:["drag","road","how to"],end:false},
    {id:400,cat:"help",text:"Drag from a house",slot:null,keys:["drag","house","how to"],end:false},
    {id:401,cat:"help",text:"Connect houses to workplaces",slot:null,keys:["houses","workplaces","how to","connect"],end:false},
    {id:402,cat:"help",text:"Hint: add a roundabout",slot:null,keys:["hint","tip","roundabout"],end:false},
    {id:403,cat:"help",text:"Hint: try a bridge",slot:null,keys:["hint","tip","bridge"],end:false},
    {id:404,cat:"help",text:"Hint: upgrade the roads",slot:null,keys:["hint","tip","upgrade"],end:false},
    {id:405,cat:"help",text:"Pause the game first",slot:null,keys:["pause","stop","wait"],end:false},
    {id:406,cat:"help",text:"Undo that road",slot:null,keys:["undo","back","oops","remove"],end:false},
    {id:407,cat:"help",text:"Try again, you can do it!",slot:null,keys:["retry","encourage","again"],end:true},
    {id:408,cat:"help",text:"It gets easier!",slot:null,keys:["easy","practice","encourage"],end:true},
    {id:409,cat:"help",text:"Take your time",slot:null,keys:["slow","relax","no rush"],end:false},
    {id:410,cat:"help",text:"Slow and steady!",slot:null,keys:["slow","careful","steady"],end:true},
    {id:411,cat:"help",text:"Look at the red timer",slot:null,keys:["timer","red","warning"],end:false},
    {id:412,cat:"help",text:"Look at the map first",slot:null,keys:["map","plan","look"],end:false},
    {id:413,cat:"help",text:"I'll show you!",slot:null,keys:["show","teach","help"],end:true},
  ];

  var EMOJI = [
    {id:0,ch:"😀",name:"smile",keys:["happy","grin","smiley"]},
    {id:1,ch:"😁",name:"grin",keys:["happy","beam"]},
    {id:2,ch:"😂",name:"laugh",keys:["lol","funny","haha"]},
    {id:3,ch:"😎",name:"cool",keys:["sunglasses","nice"]},
    {id:4,ch:"🤩",name:"star struck",keys:["wow","amazed","excited"]},
    {id:5,ch:"😮",name:"surprised",keys:["wow","oh","shock"]},
    {id:6,ch:"🤔",name:"thinking",keys:["hmm","think","wonder"]},
    {id:7,ch:"😴",name:"sleepy",keys:["tired","sleep","zzz"]},
    {id:8,ch:"😢",name:"sad",keys:["cry","tear","oh no"]},
    {id:9,ch:"🥳",name:"party face",keys:["party","celebrate","yay"]},
    {id:10,ch:"👋",name:"wave",keys:["hi","hello","bye"]},
    {id:11,ch:"👍",name:"thumbs up",keys:["good","ok","yes","like"]},
    {id:12,ch:"👏",name:"clap",keys:["well done","bravo","applause"]},
    {id:13,ch:"🙌",name:"high five",keys:["hooray","yay","cheer"]},
    {id:14,ch:"💪",name:"flex",keys:["strong","power"]},
    {id:15,ch:"🤞",name:"fingers crossed",keys:["luck","hope","good luck"]},
    {id:16,ch:"🛣️",name:"road",keys:["street","highway","motorway"]},
    {id:17,ch:"🚗",name:"car",keys:["drive","vehicle","traffic"]},
    {id:18,ch:"🏠",name:"house",keys:["home","building"]},
    {id:19,ch:"🌳",name:"tree",keys:["park","nature","green"]},
    {id:20,ch:"🏁",name:"flag",keys:["finish","race","end"]},
    {id:21,ch:"🏆",name:"trophy",keys:["win","winner","prize","gold"]},
    {id:22,ch:"⭐",name:"star",keys:["favorite","great","best"]},
    {id:23,ch:"⏰",name:"clock",keys:["time","timer","alarm"]},
    {id:24,ch:"🎁",name:"gift",keys:["present","reward","surprise"]},
    {id:25,ch:"💡",name:"lightbulb",keys:["idea","tip","hint"]},
    {id:26,ch:"✨",name:"sparkles",keys:["shiny","magic","sparkle"]},
    {id:27,ch:"🔥",name:"fire",keys:["hot","great","amazing"]},
    {id:28,ch:"🌈",name:"rainbow",keys:["colors","happy"]},
    {id:29,ch:"☀️",name:"sun",keys:["sunny","day","warm"]},
    {id:30,ch:"☁️",name:"cloud",keys:["sky","weather"]},
    {id:31,ch:"🎉",name:"confetti",keys:["party","celebrate","congrats"]},
    {id:32,ch:"🎈",name:"balloon",keys:["party","birthday","fun"]},
    {id:33,ch:"🍀",name:"clover",keys:["luck","lucky","good luck"]},
    {id:34,ch:"🐱",name:"cat",keys:["kitty","kitten","pet"]},
    {id:35,ch:"🐶",name:"dog",keys:["puppy","pet"]},
    {id:36,ch:"🐰",name:"rabbit",keys:["bunny"]},
    {id:37,ch:"🐼",name:"panda",keys:["bear"]},
    {id:38,ch:"🐦",name:"bird",keys:["tweet"]},
    {id:39,ch:"🐢",name:"turtle",keys:["slow","tortoise"]},
  ];

  var slots = {
    city: [],
    mode: [{id:'classic',name:'Classic'},{id:'plus',name:'Plus'},{id:'duel',name:'a duel'},{id:'coop',name:'co-op'},{id:'daily',name:'the daily'},{id:'weekly',name:'the weekly'}],
    time: [{id:'now',name:'now'},{id:'soon',name:'in a bit'},{id:'later',name:'later'},{id:'tonight',name:'tonight'},{id:'tomorrow',name:'tomorrow'},{id:'weekend',name:'this weekend'}],
    thing: [{id:'bridges',name:'bridges'},{id:'tunnels',name:'tunnels'},{id:'roundabouts',name:'roundabouts'},{id:'lights',name:'traffic lights'},{id:'motorways',name:'motorways'},{id:'roads',name:'roads'},{id:'houses',name:'houses'},{id:'workplaces',name:'workplaces'},{id:'upgrades',name:'upgrades'},{id:'shortcuts',name:'shortcuts'}]
  };

  var POPULAR = [1,74,304,19,22,44,180,207,17,13,316,96];

  var MAX_TILES = 3, MAX_EMOJI = 3, MAX_CITIES = 60;

  var byId = new Map();
  TILES.forEach(function (t) { byId.set(t.id, t); });

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function slotEntry(slot, value) {
    if (typeof slot !== 'string' || !hasOwn(slots, slot) || typeof value !== 'string') return null;
    var list = slots[slot];
    for (var i = 0; i < list.length; i++) if (list[i].id === value) return list[i];
    return null;
  }

  function tile(id) {
    return (typeof id === 'number' && byId.has(id)) ? byId.get(id) : null;
  }

  function slotList(slot) {
    return (typeof slot === 'string' && hasOwn(slots, slot)) ? slots[slot].slice() : [];
  }

  function cleanCityName(name, id) {
    var n = String(name == null ? '' : name).replace(/[^A-Za-zÀ-ɏ .'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24).trim();
    if (!n) n = id.charAt(0).toUpperCase() + id.slice(1);
    return n;
  }

  function setCities(list) {
    var out = [], seen = Object.create(null);
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length && out.length < MAX_CITIES; i++) {
        var c = list[i];
        if (!c || typeof c.id !== 'string' || !/^[a-z]{2,20}$/.test(c.id) || seen[c.id]) continue;
        seen[c.id] = 1;
        out.push({ id: c.id, name: cleanCityName(c.name, c.id) });
      }
    }
    slots.city = out;
    buildIndex();
    return out.length;
  }

  // ---------- render / validate ----------

  function upFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function render(msg) {
    if (!msg || typeof msg !== 'object') return '';
    var t = Array.isArray(msg.t) ? msg.t : [];
    var s = Array.isArray(msg.s) ? msg.s : [];
    var e = Array.isArray(msg.e) ? msg.e : [];
    var parts = [];
    for (var i = 0; i < t.length && i < MAX_TILES; i++) {
      var tl = tile(t[i]);
      if (!tl) continue;
      var text = tl.text;
      if (tl.slot) {
        var ent = slotEntry(tl.slot, s[i]);
        text = text.replace('{' + tl.slot + '}', ent ? ent.name : '…');
        text = upFirst(text);
      }
      parts.push(text);
    }
    var em = '';
    for (var j = 0; j < e.length && j < MAX_EMOJI; j++) {
      var x = e[j];
      if (typeof x === 'number' && x >= 0 && x < EMOJI.length && EMOJI[x].id === x) em += EMOJI[x].ch;
    }
    if (em) parts.push(em);
    return parts.join(' ');
  }

  // tile ids that must not be mixed (see validate); ids never change
  function idSet(a) { var o = Object.create(null); a.forEach(function (i) { o[i] = 1; }); return o; }
  var PRAISE = idSet([74, 75, 87, 88, 115, 137, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 198, 199, 200, 201, 202, 203, 204, 205, 206, 220, 224, 225, 226, 227, 333, 338, 339, 356, 358]);
  var LAUGH = idSet([212, 213]);
  var FAIL = idSet([85, 197, 209, 211, 218, 219]);
  var MOCK = idSet([2, 8]); // laughing and crying faces

  function validate(msg) {
    if (!msg || typeof msg !== 'object') return false;
    var t = msg.t == null ? [] : msg.t;
    var s = msg.s == null ? [] : msg.s;
    var e = msg.e == null ? [] : msg.e;
    if (!Array.isArray(t) || !Array.isArray(s) || !Array.isArray(e)) return false;
    if (t.length > MAX_TILES || e.length > MAX_EMOJI || s.length > t.length) return false;
    if (t.length + e.length < 1) return false;
    var seen = Object.create(null);
    for (var i = 0; i < t.length; i++) {
      var tl = tile(t[i]);
      if (!tl) return false;
      if (seen[tl.id]) return false;
      seen[tl.id] = 1;
      var v = s[i];
      if (tl.slot) {
        if (!slotEntry(tl.slot, v)) return false;
      } else if (v !== null && v !== undefined) {
        return false;
      }
    }
    for (var j = 0; j < e.length; j++) {
      var x = e[j];
      if (typeof x !== 'number' || x % 1 !== 0 || x < 0 || x >= EMOJI.length) return false;
    }
    // no mean combinations: mocking a mistake, or laughing after a compliment
    var hasP = 0, hasL = 0, hasF = 0, hasM = 0;
    for (var a = 0; a < t.length; a++) { if (PRAISE[t[a]]) hasP = 1; if (LAUGH[t[a]]) hasL = 1; if (FAIL[t[a]]) hasF = 1; }
    for (var b = 0; b < e.length; b++) if (MOCK[e[b]]) hasM = 1;
    if (hasL && (hasF || hasP)) return false;
    if (hasM && (hasP || hasF)) return false;
    return true;
  }

  // ---------- search (local only; the query is never stored) ----------

  var STOP = Object.create(null);
  ('a an the to of is it in on at i im my me we you your are be do and for with this that us ill its lets let')
    .split(' ').forEach(function (w) { STOP[w] = 1; });

  function norm(s) {
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (err) { /* old engine */ }
    return s.replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function stem(w) {
    var n = w.length;
    if (n > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    var cut = false;
    if (n > 5 && /ing$/.test(w)) { w = w.slice(0, -3); cut = true; }
    else if (n > 4 && /ed$/.test(w) && !/eed$/.test(w)) { w = w.slice(0, -2); cut = true; }
    if (cut) {
      if (/(.)\1$/.test(w)) w = w.slice(0, -1);
      return w;
    }
    if (n > 3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    if (w.length > 4 && /e$/.test(w)) w = w.slice(0, -1);
    return w;
  }

  function tokens(s) {
    var raw = norm(s);
    if (!raw) return [];
    var out = [], parts = raw.split(' ');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && !STOP[parts[i]]) out.push(stem(parts[i]));
    }
    return out;
  }

  // Optimal-string-alignment (Damerau-Levenshtein) distance, bailing out above max.
  function dist(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[lb];
  }

  var vocab = new Map(); // term -> Map(docKey -> weight)
  var docInfo = new Map(); // docKey -> {type,id,len}

  function addTerm(term, doc, w) {
    if (!term) return;
    var post = vocab.get(term);
    if (!post) { post = new Map(); vocab.set(term, post); }
    if ((post.get(doc) || 0) < w) post.set(doc, w);
  }

  function addText(s, doc, w) {
    var tk = tokens(s);
    for (var i = 0; i < tk.length; i++) addTerm(tk[i], doc, w);
  }

  function buildIndex() {
    vocab = new Map();
    docInfo = new Map();
    var catName = {};
    CATS.forEach(function (c) { catName[c.id] = c.name; });
    TILES.forEach(function (t) {
      var doc = 'T' + t.id;
      docInfo.set(doc, { type: 'tile', id: t.id, len: t.text.length });
      addText(t.text.replace(/\{[a-z]+\}/g, ' '), doc, 3);
      t.keys.forEach(function (k) { addText(k, doc, 2.4); });
      addText(catName[t.cat] || '', doc, 1);
      if (t.slot && slots[t.slot]) {
        slots[t.slot].forEach(function (v) { addText(v.name, doc, 1.6); });
      }
    });
    EMOJI.forEach(function (m) {
      var doc = 'E' + m.id;
      docInfo.set(doc, { type: 'emoji', id: m.id, len: 6 });
      addText(m.name, doc, 2.4 * 0.8);
      m.keys.forEach(function (k) { addText(k, doc, 2 * 0.8); });
    });
  }

  function popularResults(limit) {
    return POPULAR.slice(0, limit).map(function (id) { return { type: 'tile', id: id, score: 0 }; });
  }

  function search(query, limit) {
    limit = (typeof limit === 'number' && limit >= 1) ? Math.min(100, Math.floor(limit)) : 24;
    var qt = tokens(query).slice(0, 8);
    if (!qt.length) return popularResults(limit);

    var total = new Map(), hits = new Map();
    qt.forEach(function (q) {
      var best = new Map();
      var maxD = q.length >= 7 ? 2 : (q.length >= 4 ? 1 : 0);
      vocab.forEach(function (post, term) {
        var ms = 0;
        if (term === q) ms = 1;
        else if (q.length >= 2 && term.length > q.length && term.indexOf(q) === 0) ms = 0.6;
        else if (maxD && Math.abs(term.length - q.length) <= maxD) {
          var d = dist(term, q, maxD);
          if (d <= maxD) ms = d === 1 ? 0.55 : 0.4;
        }
        if (!ms) return;
        post.forEach(function (w, doc) {
          var v = w * ms;
          if (v > (best.get(doc) || 0)) best.set(doc, v);
        });
      });
      best.forEach(function (v, doc) {
        total.set(doc, (total.get(doc) || 0) + v);
        hits.set(doc, (hits.get(doc) || 0) + 1);
      });
    });

    var res = [];
    total.forEach(function (sc, doc) {
      var info = docInfo.get(doc);
      if (!info) return;
      if (hits.get(doc) === qt.length) sc *= 1.5;
      sc -= info.len * 0.002;
      res.push({ type: info.type, id: info.id, score: Math.round(sc * 1000) / 1000 });
    });
    if (!res.length) return popularResults(limit);
    res.sort(function (a, b) {
      return (b.score - a.score) || (a.type === b.type ? a.id - b.id : (a.type === 'tile' ? -1 : 1));
    });
    return res.slice(0, limit);
  }

  buildIndex();

  var api = {
    version: 1,
    cats: CATS,
    tiles: TILES,
    slots: slots,
    emoji: EMOJI,
    popular: POPULAR,
    setCities: setCities,
    tile: tile,
    render: render,
    validate: validate,
    search: search,
    slotList: slotList
  };

  root.LLChatData = api;

  // Quick self-test and CommonJS export (Node / test runner only).
  if (typeof module !== 'undefined') {
    (function selfTest() {
      var ids = new Set();
      TILES.forEach(function (t) {
        if (ids.has(t.id) || t.id < 1 || t.id >= 1000) throw new Error('bad tile id ' + t.id);
        ids.add(t.id);
        if (t.text.length > 40) throw new Error('tile too long ' + t.id);
      });
      if (EMOJI.length !== 40) throw new Error('emoji count');
      EMOJI.forEach(function (m, i) { if (m.id !== i) throw new Error('emoji id ' + i); });
      if (POPULAR.length !== 12 || POPULAR.some(function (id) { return !byId.has(id); })) throw new Error('popular');
      if (!validate({ t: [POPULAR[0]], s: [null], e: [0] })) throw new Error('validate sanity');
    })();
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

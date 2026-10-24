/* =====================================================================
   DISCIPLINE ENGINE — static data layer
   Exercise/program/food data is lifted verbatim from Body Build Tracker
   (body.html, built 2026-08-09) so the two never disagree.
   ===================================================================== */

/* ------------------------------- RANKS -------------------------------
   Tale of Demons and Gods cultivation ladder. Level -> rank plate.
   Chosen deliberately: the Nie Li Doctrine is already the operating model.
--------------------------------------------------------------------- */
const RANKS = [
  { at:   1, name: 'Mortal',        tier: 'Red Level',    color: '#8a8a94' },
  { at:   5, name: 'Awakened',      tier: 'Red Level',    color: '#c96a5a' },
  { at:  10, name: 'Bronze Rank',   tier: 'Bronze',       color: '#b07a42' },
  { at:  16, name: 'Silver Rank',   tier: 'Silver',       color: '#adb5c4' },
  { at:  24, name: 'Gold Rank',     tier: 'Gold',         color: '#d4a04a' },
  { at:  34, name: 'Black Gold',    tier: 'Black Gold',   color: '#a8853f' },
  { at:  46, name: 'Legend Rank',   tier: 'Legend',       color: '#4ec9a0' },
  { at:  60, name: 'Ground Soul',   tier: 'Soul Realm',   color: '#4aa3d4' },
  { at:  76, name: 'Heavenly Fate', tier: 'Fate Realm',   color: '#8a7bd8' },
  { at:  94, name: 'Sky Soul',      tier: 'Sky Realm',    color: '#c77bd8' },
  { at: 114, name: 'Demon Spirit',  tier: 'Demon Realm',  color: '#e0524d' },
];

/* ------------------------------- STATS -------------------------------
   \uFE0E is the text-presentation selector: it stops Chrome substituting a
   colour emoji for these glyphs, which would wreck the monochrome HUD.
--------------------------------------------------------------------- */
const STATS = {
  STR: { name: 'Strength',   glyph: '\u2694\uFE0E', color: '#e0524d', blurb: 'Training completed under load.' },
  VIT: { name: 'Vitality',   glyph: '\u2618\uFE0E', color: '#4ec9a0', blurb: 'Calories eaten. Your true bottleneck.' },
  FOC: { name: 'Focus',      glyph: '\u25C8',       color: '#4aa3d4', blurb: 'Deep work blocks that produced output.' },
  WIL: { name: 'Will',       glyph: '\u26E9\uFE0E', color: '#8a7bd8', blurb: 'Showing up on the days you did not want to.' },
  GLD: { name: 'Fortune',    glyph: '\u25C6',       color: '#d4a04a', blurb: 'Actions that moved money toward you.' },
};

/* --------------------------- XP ECONOMY ------------------------------
   The Gate is worth more than everything else combined on purpose.
--------------------------------------------------------------------- */
const XP = {
  habit:      10,
  deepWork:   15,   // per 25-minute block
  posture:    15,
  workoutSet:  4,   // per logged set
  workoutDone: 60,  // finishing every exercise in the day's session
  calorieHit:  50,
  proteinHit:  25,
  questStep:   40,
  gate:       150,  // a last-mile action: needs another human's verdict
  boss:       500,  // a project actually shipped
};

/* --------------------------- DAILY SCHEDULE --------------------------
   Editable in Settings. t = 24h "HH:MM". Each block can fire a push.
   Times are deliberately loose — this is a skeleton, not a prison.
--------------------------------------------------------------------- */
const DEFAULT_SCHEDULE = [
  { id:'wake',    t:'08:00', label:'Wake + 500ml water',        kind:'habit',  stat:'WIL', push:true  },
  { id:'meal1',   t:'08:30', label:'Meal 1 — eat on the clock', kind:'fuel',   stat:'VIT', push:true  },
  { id:'gate',    t:'10:00', label:'THE GATE — the one send',   kind:'gate',   stat:'GLD', push:true  },
  { id:'deep1',   t:'10:30', label:'Deep work block 1',         kind:'deep',   stat:'FOC', push:true  },
  { id:'shake',   t:'12:00', label:'Gainer shake (745 kcal)',   kind:'fuel',   stat:'VIT', push:true  },
  { id:'meal2',   t:'13:00', label:'Meal 2',                    kind:'fuel',   stat:'VIT', push:true  },
  { id:'train',   t:'15:30', label:'Train — eat BEFORE, not after', kind:'train', stat:'STR', push:true },
  { id:'deep2',   t:'17:30', label:'Deep work block 2',         kind:'deep',   stat:'FOC', push:true  },
  { id:'meal3',   t:'19:00', label:'Meal 3',                    kind:'fuel',   stat:'VIT', push:true  },
  { id:'posture', t:'21:00', label:'5-min posture block',       kind:'habit',  stat:'WIL', push:true  },
  { id:'meal4',   t:'21:30', label:'Meal 4 / night shake',      kind:'fuel',   stat:'VIT', push:true  },
  { id:'review',  t:'22:30', label:'Close the day — log + review', kind:'habit', stat:'WIL', push:true },
];

/* ------------------------------ TARGETS ------------------------------ */
const DEFAULT_TARGETS = {
  weightLb:    150,
  goalWeightLb:165,
  kcal:        2800,
  protein:     130,
  deepBlocks:  4,
  heightIn:    69,
};

/* ============================ EXERCISES ============================== */
const EX = {
  pushup:{n:'Push-up (your level)',m:'Chest, front delts, triceps',w:false,
    cue:'Hands under shoulders, elbows tucked to about <b>45\u00B0</b> \u2014 not flared out sideways. Squeeze your glutes and brace your abs so your body is one straight line. Lower until your chest is a fist off the surface, <b>2 seconds down</b>, then drive up. Do not let your hips sag or pike up.',
    ladder:['Wall push-up','Table/counter incline','Couch incline','Knee push-up','Full push-up','Feet on couch (decline)','Diamond push-up','Archer push-up'],
    why:'Your #1 chest builder. Start at the level where you can barely get 8 clean reps \u2014 that is the right level.'},
  dbfloorpress:{n:'DB Floor Press',m:'Chest, triceps',w:true,
    cue:'Lie on the mat, knees bent. Press the 25 lb dumbbell from chest to lockout. Your upper arm stops when your <b>elbow touches the floor</b> \u2014 that is the safety. Go one arm at a time if two-arm is impossible with one bell. Slow on the way down.',
    ladder:['Two hands on one bell','Single arm 25 lb','Single arm, 3s lower','Single arm, pause on floor'],
    why:'Different angle than push-ups, and loadable. Floor press protects your shoulder as a beginner.'},
  pike:{n:'Pike Push-up',m:'Shoulders, triceps',w:false,
    cue:'Push-up position, then <b>walk your feet in and lift your hips high</b> into an upside-down V. Head travels to the floor <b>between your hands</b>, not in front. Elbows go slightly forward. Higher hips = harder.',
    ladder:['Hips low (easy)','Hips high','Feet on a book stack','Feet on couch','Feet high + deficit on books'],
    why:'This is your overhead press substitute and it builds the shoulder cap that makes arms look wide.'},
  dbohp:{n:'DB Overhead Press',m:'Shoulders, triceps',w:true,
    cue:'Standing, ribs down \u2014 do <b>not</b> arch your lower back to get the weight up. Press the bell straight overhead until your bicep is near your ear. One arm at a time with the 25, or both light bells together.',
    ladder:['Light bells, both arms','Single arm 25 lb seated','Single arm 25 lb standing','Single arm, 3s lower'],
    why:'Overhead strength you will carry straight into the gym.'},
  dip:{n:'Bench Dip',m:'Triceps, lower chest',w:false,
    cue:'Hands on a chair/couch edge behind you, fingers forward. <b>Keep your back close to the chair</b>. Lower until upper arms are parallel to the floor \u2014 no deeper, that wrecks shoulders. Legs bent = easier, straight = harder.',
    ladder:['Knees bent, feet close','Legs straight','Feet on a second chair','Feet elevated + 25 lb on lap'],
    why:'Triceps are two-thirds of your arm size. This is the cheapest arm growth you have.'},
  latraise:{n:'DB Lateral Raise (light)',m:'Side delts',w:true,
    cue:'Use the <b>light bells</b>. Slight bend in the elbow, raise out to the sides to shoulder height, <b>lead with your elbows not your hands</b>. Lower slowly for 3 seconds. If you swing it, it is too heavy.',
    ladder:['Light bells 15 reps','Light bells 20 reps + 3s lower','Pause 1s at top','Add a set'],
    why:'Side delts are what actually make shoulders look broad and the waist look small. Nothing else hits them.'},
  tablerow:{n:'Table Row (inverted row)',m:'Back, biceps, rear delts',w:false,
    cue:'Lie under a <b>sturdy</b> table, grab the edge with both hands wider than shoulders. Body straight, heels on the floor. Pull your <b>chest to the table edge</b> and squeeze your shoulder blades together at the top. Test the table with your bodyweight before you trust it.',
    ladder:['Knees bent, torso upright','Knees bent, feet further out','Legs straight','Legs straight, feet on a chair','One arm at a time'],
    why:'This is your pull-up replacement until you get a bar. Do NOT skip it \u2014 pulling is what builds a back, and a back is what makes a waist look narrow.'},
  dbrow:{n:'1-Arm DB Row',m:'Lats, mid-back, biceps',w:true,
    cue:'One hand and one knee on a chair or couch, back flat like a tabletop. Pull the 25 to your <b>hip pocket</b>, not your armpit. Elbow drives back past your ribs. <b>Do not twist your torso</b> to help. 2s lower.',
    ladder:['25 lb x 10','25 lb x 15','25 lb x 15 + 1s squeeze','25 lb x 15 + 3s lower','Add a 4th set'],
    why:'Best back builder you own. Full stretch at the bottom is where the growth is.'},
  pullover:{n:'DB Pullover',m:'Lats, chest, serratus',w:true,
    cue:'Lie on the mat, both hands cupping one end of the 25. Arms nearly straight, lower the bell back <b>over and behind your head</b> until you feel a big stretch in your armpits/lats. Ribs stay down. Pull back over your chest.',
    ladder:['Bent arms, short range','Bent arms, full range','Straight arms','Straight arms + 3s lower'],
    why:'Stretch-loaded lat work \u2014 stretch under load is a strong growth signal, and it opens up a tight chest from sitting.'},
  curl:{n:'DB Curl',m:'Biceps',w:true,
    cue:'Elbows pinned to your sides. Curl without swinging your body. <b>Lower for 3 full seconds</b> every rep \u2014 the lowering is where biceps grow. Alternate arms with the 25, or both light bells for high reps.',
    ladder:['Light bells x15','25 lb single arm x8','25 lb single arm x12','25 lb x12 + 3s lower','25 lb x15 + 3s lower'],
    why:'You want arms. This is direct arm work \u2014 but the rows above build more arm than curls do.'},
  reardelt:{n:'Rear Delt Fly / Prone Y',m:'Rear delts, upper back, posture',w:true,
    cue:'Bent over at the hips (or face-down on the mat). Light bells or no weight. Raise arms out to the side like wings, <b>thumbs up</b>, squeeze the shoulder blades. High reps, no swinging.',
    ladder:['Bodyweight prone Y x15','Light bells x15','Light bells x20','Light bells x20 + 2s hold'],
    why:'Fixes the rounded-forward shoulders that make you look smaller than you are. Instant posture upgrade.'},
  goblet:{n:'Goblet Squat',m:'Quads, glutes, core',w:true,
    cue:'Hold the 25 at your chest like a goblet. Feet shoulder-width, toes slightly out. Sit <b>down between your heels</b>, chest tall, knees tracking over your toes. Go as deep as you can keep a flat back. Drive through the whole foot.',
    ladder:['Bodyweight to a chair','Bodyweight full depth','Goblet 25 lb x10','Goblet 25 lb x15','Goblet + 3s lower','Goblet + 2s pause at bottom'],
    why:'Your main leg builder. Legs are half your muscle mass \u2014 this is where the food goes.'},
  splitsq:{n:'Split Squat',m:'Quads, glutes, balance',w:false,
    cue:'One foot forward, one back, feet about 2 shoe-lengths apart. Drop your <b>back knee straight down</b> toward the floor, don\'t lunge forward. Front shin stays near vertical. All reps on one leg, then switch.',
    ladder:['Bodyweight, hand on wall','Bodyweight free','Hold 25 lb','Rear foot on couch (Bulgarian)','Bulgarian + 25 lb'],
    why:'One leg at a time doubles the load without needing more weight. This is the cheat code for your equipment situation.'},
  rdl:{n:'DB Romanian Deadlift',m:'Hamstrings, glutes, lower back',w:true,
    cue:'Hold the 25 in both hands in front of your thighs. Soft knees, <b>push your hips straight back</b> like you\'re closing a car door with your butt. Back stays flat, bell slides down your legs. Stop when your hamstrings scream, then squeeze your glutes to stand.',
    ladder:['Bodyweight hinge (broomstick on back)','25 lb x12','25 lb x15','Single leg 25 lb x10','Single leg + 3s lower'],
    why:'Hamstrings and glutes. Also directly fixes the pelvic tilt that pushes your belly forward.'},
  lunge:{n:'Reverse Lunge',m:'Quads, glutes',w:true,
    cue:'Step <b>backward</b> into the lunge (easier on knees than stepping forward), drop the back knee to just above the floor, then drive through the front heel to stand. Hold the 25 at your chest or hanging in one hand.',
    ladder:['Bodyweight','Bodyweight, slow','Hold 25 lb at chest','25 lb + deficit (front foot on a book)'],
    why:'Builds legs and hip stability, and it makes stairs and walking feel effortless.'},
  bridge:{n:'Glute Bridge / Hip Thrust',m:'Glutes, hamstrings',w:true,
    cue:'On your back, knees bent, heels close to your butt. <b>Tuck your pelvis first</b> (flatten your low back into the mat), then push your hips up. Squeeze the glutes hard at the top for a full second. Do not arch your back to go higher.',
    ladder:['Both feet, bodyweight','Shoulders on couch (hip thrust)','Hip thrust + 25 lb on hips','Single leg bridge','Single leg + 25 lb'],
    why:'Strong glutes hold your pelvis in neutral. That alone flattens the "big belly" look you described.'},
  nordic:{n:'Hamstring Walkout / Nordic Negative',m:'Hamstrings',w:false,
    cue:'Kneel on the mat, feet hooked under a couch (or have nothing and go slow). Keep hips locked straight \u2014 <b>no bending at the waist</b> \u2014 and lower your torso forward as slowly as you can. Catch yourself with your hands and push back up.',
    ladder:['Glute-ham hold 10s','Slow lean 30\u00B0 x6','Slow lean 60\u00B0 x6','Full negative x5','Negative + assisted up'],
    why:'The hardest hamstring exercise that needs zero equipment. Bulletproofs your knees for the gym later.'},
  calf:{n:'Calf Raise',m:'Calves',w:true,
    cue:'Stand with the balls of your feet on a stair or book stack, heels hanging off. <b>Drop the heel all the way down for a deep stretch</b>, then push up as high as you can go and hold 1 second. Hold the 25 in one hand for load.',
    ladder:['Both legs bodyweight x20','Both legs + 25 lb x20','Single leg x15','Single leg + 25 lb x15'],
    why:'Calves are stubborn and only respond to deep stretch and high reps. Do them or they stay skinny.'},
  legraise:{n:'Reverse Crunch / Leg Raise',m:'Lower abs, hip flexors',w:false,
    cue:'On your back, hands under your butt. <b>Curl your pelvis up off the floor</b> toward your ribs \u2014 this is the whole exercise. It is not about how high your legs go. Your low back must stay pressed into the mat the entire time.',
    ladder:['Knees bent, small curl','Knees bent, full curl','Legs at 90\u00B0','Straight legs','Straight legs, slow negative'],
    why:'Lower abs are the hardest part to develop and the part that shows last. Pelvic curl beats leg swinging every time.'},
  crunch:{n:'Weighted Crunch',m:'Upper abs (the six-pack)',w:true,
    cue:'On your back, knees bent, holding the 25 on your chest (or behind your head when strong). <b>Crunch your ribs toward your hips</b> \u2014 short range, big squeeze. Do not pull on your neck. 2s up, 2s down.',
    ladder:['Bodyweight x20','Hold light bell x15','Hold 25 lb on chest x12','25 lb behind head x12','25 lb + 3s lower'],
    why:'This is THE ab exercise for you. Abs are a muscle \u2014 to see them at your bodyweight you need them THICKER, and that means adding weight, not doing 200 crunches.'},
  rollout:{n:'Towel Rollout',m:'Full abs, anti-extension',w:false,
    cue:'Kneel on the mat, hands on a towel on a smooth floor (or on two socks). Slide your hands forward, <b>keeping your hips locked and your ribs pulled down</b>. Go only as far as you can without your low back arching. Pull back with your abs.',
    ladder:['Short slide 12in','Half slide','3/4 slide','Full extension','From feet (standing rollout)'],
    why:'The ab wheel is the best ab exercise in existence and this is it for free. Stop at the range where your back stays flat.'},
  deadbug:{n:'Dead Bug',m:'Deep core, pelvic control',w:false,
    cue:'On your back, arms straight up, knees over hips at 90\u00B0. <b>Press your low back flat into the mat and keep it there</b>. Slowly extend opposite arm and leg away, breathe out, return. If your back lifts off the mat, shorten the range.',
    ladder:['Legs only','Arms only','Opposite arm+leg','Full extension slow','Hold light bells'],
    why:'This teaches your core to hold your pelvis neutral. Directly fixes the arched-back posture that makes a lean stomach stick out.'},
  sideplank:{n:'Side Plank',m:'Obliques, waist',w:false,
    cue:'On your forearm, body in a straight line from head to heels. <b>Push the floor away and lift your hip high</b>. Do not let it sag. Hold for time, both sides equal.',
    ladder:['Knees down 20s','Full side plank 20s','Full 45s','Top leg raised','Hold 25 lb on hip'],
    why:'Builds the obliques without the bulk that widens your waist, and it locks in the V-taper.'},
  carry:{n:'Suitcase Carry',m:'Core, grip, traps',w:true,
    cue:'Hold the 25 in ONE hand, walk. <b>Stand perfectly upright</b> \u2014 do not lean away from the weight. Shoulders level, ribs down, walk slow and controlled. Switch hands.',
    ladder:['30s per side','45s per side','60s per side','60s + slow tempo walk'],
    why:'Core strength that transfers to everything, and it builds the traps that fill out a shirt.'},
};

/* ============================= PROGRAM =============================== */
const W = {
  upperA:{n:'Upper A \u2014 Chest & Back',focus:'Chest, back, arms',
    ex:[['pushup',4,8,15],['tablerow',4,8,15],['dbfloorpress',3,8,15],['dbrow',3,8,15],
        ['dip',3,10,15],['curl',3,10,15],['latraise',3,12,20]]},
  lowerA:{n:'Lower A \u2014 Squat',focus:'Quads, glutes, calves + lower abs',
    ex:[['goblet',4,8,15],['splitsq',3,8,12],['bridge',3,10,20],['calf',3,12,20],
        ['legraise',3,10,20],['carry',2,30,45]]},
  upperB:{n:'Upper B \u2014 Shoulders & Back',focus:'Shoulders, back, chest, arms',
    ex:[['pike',4,6,12],['tablerow',4,8,15],['dbfloorpress',3,8,15],['dbohp',3,8,12],
        ['pullover',3,10,15],['reardelt',3,12,20],['curl',3,10,15]]},
  lowerB:{n:'Lower B \u2014 Hinge + Abs',focus:'Hamstrings, glutes + the whole ab wall',
    ex:[['rdl',4,10,15],['lunge',3,8,12],['nordic',3,5,8],['calf',3,12,20],
        ['crunch',3,10,15],['rollout',3,6,12],['sideplank',3,20,45]]},
  fbA:{n:'Full Body A',focus:'Everything \u2014 busy-week mode',
    ex:[['pushup',4,8,15],['goblet',4,8,15],['tablerow',4,8,15],['rdl',3,10,15],
        ['latraise',3,12,20],['legraise',3,10,20]]},
  fbB:{n:'Full Body B',focus:'Everything \u2014 busy-week mode',
    ex:[['dbfloorpress',4,8,15],['splitsq',3,8,12],['dbrow',4,8,15],['bridge',3,10,20],
        ['dip',3,10,15],['crunch',3,10,15],['sideplank',2,20,45]]},
  fbC:{n:'Full Body C',focus:'Everything \u2014 busy-week mode',
    ex:[['pike',4,6,12],['lunge',3,8,12],['tablerow',4,8,15],['curl',3,10,15],
        ['rollout',3,6,12],['calf',3,12,20]]},
};

const SCHED = {  // index 0 = Sunday
  '4day':['rest','upperA','lowerA','rest','upperB','lowerB','rest'],
  '3day':['rest','fbA','rest','fbB','rest','fbC','rest'],
};
const DAYNAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const POSTURE=[
  ['Dead bug','2 \u00D7 8 slow per side \u2014 low back flat on the mat'],
  ['Glute bridge','2 \u00D7 15 \u2014 tuck the pelvis first, squeeze 1s at top'],
  ['Couch hip-flexor stretch','45s per side \u2014 squeeze the glute of the back leg'],
  ['Wall slide / chin tuck','2 \u00D7 10 \u2014 back of head, upper back and butt on the wall'],
];

/* =============================== FOOD ================================ */
/* [name, kcal, protein_g, note] */
const FOODS=[
  ['THE GAINER SHAKE',745,42,'1c whole milk + 2 tbsp peanut butter + 1 banana + 40g oats + 1c yogurt. Blend. Drink between meals, NEVER instead of one.'],
  ['Injera (1 large)',200,6,''],
  ['Shiro (1 cup)',300,15,''],
  ['Doro wat (leg + egg)',400,30,''],
  ['Key wat / beef stew',350,28,''],
  ['Tibs (1 plate)',400,35,''],
  ['Kitfo',400,30,''],
  ['Misir wat (lentils)',250,13,''],
  ['Gomen (collards)',120,4,''],
  ['Ayib (cottage cheese)',100,12,''],
  ['Firfir',350,10,''],
  ['Ful (bowl)',300,15,''],
  ['2 eggs',140,12,''],
  ['Whole milk (1 cup)',150,8,''],
  ['Greek yogurt (1 cup)',150,20,''],
  ['Peanut butter (2 tbsp)',190,8,''],
  ['Banana',105,1,''],
  ['Oats (40g dry)',150,5,''],
  ['Rice (1 cup)',205,4,''],
  ['Chicken breast (100g)',165,31,''],
  ['Avocado (half)',160,2,''],
  ['Almonds (handful)',165,6,''],
  ['Olive oil (1 tbsp)',120,0,''],
  ['Dabo / bread slice',80,3,''],
];

/* ============================== QUESTS ===============================
   Seeded from C:\Users\Dawit\Claude\All Projects\. `gate` is the single
   last-mile action that is actually blocking the project — the step that
   needs another human's verdict. That is the thing this app exists for.
--------------------------------------------------------------------- */
const SEED_QUESTS = [
  { id:'example', name:'Your first money project', tier:'S', stat:'GLD', status:'active',
    blurb:'Replace this with your own project in Projects. Keep the goal to one line.',
    gate:'The one step another person has to see today.',
    steps:['Build the smallest version','Show it to one real person','Get the first yes','Get paid once'] },
  { id:'body', name:'Body — reach your goal weight', tier:'S', stat:'STR', status:'active',
    blurb:'Eat on a clock, not on hunger.',
    gate:'Hit your calorie target today.',
    steps:['30 straight days on target','First milestone','Second milestone','Goal weight'] },
];

/* --------------------------- MOTTOS / VOICE -------------------------- */
const GATE_LINES = [
  'Everything is built. Nothing is sent. That is the whole problem.',
  'The work is done. The verdict is not yours to give.',
  'You have never failed at building. You fail at the send.',
  'Eighty hours built. Five hours unsent. Close the gap.',
  'A finished thing nobody has seen is an unfinished thing.',
  'The last mile is the only mile that has ever stopped you.',
];

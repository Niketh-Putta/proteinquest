/**
 * Compact multi-cuisine dish-ID guidance for meal photo analysis.
 * Keep token-light: cue → dish name rules + a few diverse few-shots.
 */

/** Regional / cuisine naming rules injected into the system prompt. */
export const CUISINE_IDENTIFY_RULES = `CUISINE / DISH NAMING (critical - prefer specific names over generic labels):
- Never default to vague "curry", "stir fry", "rice bowl", "noodles", "wrap", "grill plate" when cues support a named dish.
- food_name = most specific cultural dish that fits visual cues (sauce color/texture, spice paste, cut, sides, vessel). Items MUST match that dish's proteins + sides (no chicken items under a prawn dish name).
- Use plate context: banana leaf / steel thali / dosa tawa / clay pot / bamboo steamer / takeaway carton / tortilla / pita / cast-iron skillet / styrofoam chip box.

INDIAN REGIONAL (name the region when cues fit):
- South/Andhra-Telugu: gongura (dark sour greens) with prawn/mutton; spicy red chicken/mutton curry; fish fry; sambar+rice; rasam; idli/dosa/uttapam; pappu/dal; pulihora; coconut chutney; banana-leaf meals.
- Tamil/Chettinad: dark pepper-fennel masala, chicken/fish Chettinad, rasam, idli sambar.
- Kerala/Coastal: coconut-milk fish curry, appam, puttu, Malabar prawns, Kerala beef fry.
- Goan/Portuguese-coastal: vindaloo (dark vinegar-red), xacuti, fish curry rice, recheado.
- North/Punjabi: butter chicken (orange creamy), dal makhani, paneer tikka/butter, chole bhature, amritsari fish, tandoori (char + red marinade), naan/roti.
- Gujarati: dhokla, thepla, undhiyu, kadhi, mild-sweet thali cues.
- Bengali: mustard-yellow fish (shorshe), hilsa, kosha mangsho (dark slow-cooked), luchi, mishti cues.
- Hyderabadi: biryani (layered rice+meat, fried onions, saffron), haleem.
- Greens: gongura/sorrel ≠ palak ≠ methi ≠ curry-leaf garnish. Wilted dark greens + prawns → Gongura prawns, not "spinach curry".

EAST / SE ASIA:
- Chinese Sichuan: red chili oil, Sichuan peppercorn, mapo tofu, kung pao, dan dan, twice-cooked pork. Cantonese: clearer sauces, char siu glaze, steamed fish, dim sum/siu mai/har gow, claypot rice. Avoid bare "Chinese stir fry".
- Japanese: ramen (broth+tare+toppings), donburi (gyudon/oyakodon/katsu-don), sushi/sashimi, tonkatsu, teriyaki salmon/chicken, karaage, miso soup, onigiri. Name the don/ramen type when clear.
- Korean: gochujang-red (kimchi jjigae, tteokbokki), bulgogi, galbi, bibimbap (egg+veg+gochujang on rice), Korean fried chicken, japchae, samgyeopsal+ssam.
- Thai: green/red/massaman curry (coconut), pad Thai, pad kra pao (holy basil+chili+fried egg), tom yum, som tam. Lemongrass/kaffir/basil cues matter.
- Vietnamese: pho (herbs+rice noodles+broth), bun cha, banh mi, broken rice/com tam, fresh spring rolls.
- Malaysian/Indonesian: nasi lemak, laksa, rendang (dark dry coconut beef/chicken), satay+peanut, nasi goreng, mee goreng, gado-gado.

MIDDLE EAST / MED / LATIN / AFRICA / CARIBBEAN / EUROPE / US / UK:
- Middle Eastern: shawarma, falafel, hummus, kebab/kofta, mansaf, mujadara, fattoush, labneh; warm spices + pita/rice.
- Mediterranean/Greek/Turkish: souvlaki, gyro, moussaka, Greek salad+feta, shakshuka, paella (saffron rice+seafood), pesto pasta only when basil-green clear.
- Mexican/Latin: taco/burrito/enchilada/quesadilla (name fillings), carne asada, carnitas, al pastor, mole, ceviche, arroz con pollo, feijoada cues.
- African: jollof rice, egusi, suya, tagine, injera+wat, bobotie - match starch (rice/injera/couscous).
- Caribbean: jerk chicken/pork, curry goat, rice and peas, oxtail, plantain sides.
- European: carbonara/bolognese/pesto (name sauce), schnitzel, goulash, fish and chips, shepherd's/cottage pie, roast dinner.
- American BBQ/soul: brisket, pulled pork, ribs, fried chicken, mac and cheese, collards, cornbread - smoke/bark/sauce cues.
- UK takeaway: chicken tikka masala, doner/kebab + chips, fish and chips, Chinese salt & pepper chips, peri-peri chicken, chippy tray - prefer outlet-style names when clear.

PROTEIN SPECIES (do not default to chicken):
- Prawn/shrimp: C-shaped, segmented, tails - never call chicken. Fish: flakes/fillets. Mutton/lamb: darker, often bone-in. Paneer: pale cubes. Tofu: uniform white blocks. Egg: oval white/yolk.
- Items must echo food_name proteins + cuisine-typical sides (e.g. bibimbap → rice+veg+egg+gochujang; pad Thai → rice noodles+protein+peanut; pho → rice noodles+broth+herbs+protein).`;

/** Diverse few-shots (macros approximate; adapt to the plate). */
export const CUISINE_FEW_SHOTS = `Cuisine few-shots (adapt; do not copy blindly):
C) Gongura prawns (Andhra): prawns ~120g + gongura sauce ~180g + oil ~14g → food_name="Gongura prawns"; items prawns+gongura (NOT chicken); protein ~35g; kcal ~350-420
S) Gongura rice (full plate): rice mound filling most of plate ~320g + gongura curry ~100g + oil/ghee ~14g → food_name="Gongura rice"; protein ~12g; kcal ~560-620. Never call a heaped rice plate "half-plate" or ~300 kcal.
J) Palak paneer: paneer ~100g + palak gravy ~180g → "Palak paneer" (not "spinach curry")
K) Chicken only when chunks clearly chicken (not C-shaped prawns) - Chettinad/Andhra chicken curry, butter chicken, etc.
L) Mapo tofu (Sichuan): soft tofu ~180g + minced pork/beef ~60g + chili oil → "Mapo tofu" (not "tofu stir fry"); protein ~22g
M) Chicken bibimbap: rice ~220g + beef/chicken ~80g + veg + egg + gochujang → "Bibimbap" (not "rice bowl")
N) Pad kra pao gai: minced chicken ~140g + holy basil + chili + fried egg + rice ~200g → "Pad kra pao chicken"
O) Chicken shawarma plate: carved chicken ~150g + rice/pita + salad/hummus → "Chicken shawarma" (not "grill plate")
P) Beef tacos (~2): tortilla + carne asada/carnitas ~100g + salsa → name the taco style
Q) Jerk chicken + rice and peas: jerk chicken ~160g + rice/peas ~200g → "Jerk chicken with rice and peas"
R) UK fish and chips: battered fish ~160g + chips ~180g → "Fish and chips"`;

/** Short user-message nudge for vision calls (OpenAI / Gemini). */
export const CUISINE_USER_NUDGE =
  "Identify the specific regional/cultural dish when cues support it (Indian regional, Chinese regional, Japanese, Korean, Thai, Vietnamese, Malay/Indo, Middle Eastern, Med, Mexican/Latin, African, Caribbean, European, US BBQ/soul, UK takeaway). Prefer exact dish names over generic curry/stir-fry/rice-bowl. Items must match the protein and cuisine you see.";

/** OpenAI user text block (label-first + cuisine + portions). */
export const OPENAI_USER_ANALYZE_TEXT =
  "Analyze protein + calories. Prefer labels/OCR when present (set label_* fields). Else: " +
  CUISINE_USER_NUDGE +
  " Distinguish prawn/shrimp vs chicken vs mutton vs fish vs paneer/tofu; name distinctive greens (gongura/sorrel, palak, methi) when supported; size the plate (full-plate rice mound ~300-380g cooked, not half-plate); estimate cooked grams; density math; add cooking oil when curry/greens look glossy. Never call prawns chicken. Use any user note only when it matches the photo; reject dish notes on non-food images. Return JSON only.";

/** Gemini attempt-0 user text. */
export const GEMINI_USER_ANALYZE_TEXT =
  "Analyze this image for protein and calories. Step 0: read any nutrition labels, packaging text, or on-screen macros (OCR). If label shows protein or calories, use those as primary source (protein_source=label). Otherwise: " +
  CUISINE_USER_NUDGE +
  " Estimate grams, apply density, sum. Never default leafy South Indian prawn gravy to chicken curry. Return valid JSON only.";

/** Gemini retry user text (stricter JSON). */
export const GEMINI_USER_ANALYZE_RETRY_TEXT =
  "Analyze this image for protein and calories. Check labels/text first. Prefer exact regional/cultural dish names; match item proteins and sides to the cuisine you see. Return ONLY compact valid JSON matching the schema. Keep notes under 80 characters. No quotes or newlines inside strings.";

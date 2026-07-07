// All 10 complaints with FULLY LOCAL workflows — no API key needed.
// next: "END" = consultation complete, generate note locally.
// next: "AI"  = optionally enrich with AI (falls back gracefully if no key).

export const SYSTEM_COMPLAINTS = [

// ═══════════════════════════════════════════════════════════════════════════
// 1. FEVER — GENERAL
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "fever_general", name: "Fever — General", category: "General", ageGroup: "all",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["petechiae","purpura","stiff neck","altered","unconscious","seizure","bleeding","cyanosis"],
  commonDifferentials: ["Viral fever","Malaria","Typhoid","Dengue","UTI","Pneumonia","Meningitis"],
  tags: ["fever","pyrexia","temperature"],
  clinicalContent: `FEVER — GENERAL PEDIATRIC CLINICAL REFERENCE | India OPD Guide

ESSENTIAL HISTORY: Duration (acute <7d, subacute 1-2w, chronic >2w). Pattern: continuous (typhoid, pneumonia), remittent (viral), intermittent (malaria). Chills/rigors → malaria/bacteremia. Rash timing: day 3-5 dengue, day 1 measles. Cough/cold → URTI, pneumonia. Vomiting/diarrhea → gastroenteritis, typhoid. Headache/neck stiff → meningitis. Dysuria → UTI. Seizure → febrile seizure vs meningitis. Travel → malaria endemic, dengue zone. Vaccination status. Contact with TB. Bleeding → dengue hemorrhagic.

RED FLAGS: Petechiae/purpura → meningococcemia EMERGENCY. Neck stiffness/bulging fontanelle → meningitis. Altered consciousness → encephalitis/cerebral malaria. Respiratory distress → severe pneumonia. Seizure >5yr → not typical febrile seizure. Fever >14d → TB, malignancy, enteric. Bleeding tendency → dengue hemorrhagic. Toxic appearance → sepsis.

DIFFERENTIALS: 1. Viral fever — self-limiting 3-5d, no focus. 2. Malaria — P.vivax (intermittent); P.falciparum (continuous, severe); rigors, pallor, splenomegaly. 3. Dengue — severe myalgia, headache, retro-orbital pain, rash day 3-5, thrombocytopenia. 4. Typhoid — stepwise fever, relative bradycardia, coated tongue. 5. UTI — especially young children. 6. Pneumonia — tachypnea, cough. 7. Meningitis — triad: fever, headache, neck stiffness.

INVESTIGATIONS: CBC, malaria smear/RDT, dengue NS1+IgM, Widal (caution), blood culture if toxic, urine dipstick, CXR if cough, platelet count daily if dengue.

TREATMENT: Paracetamol 10-15mg/kg q4-6h. Avoid aspirin. Malaria: ACT per national guidelines. Typhoid: azithromycin (mild) or ceftriaxone (severe). Dengue: fluids, avoid NSAIDs. No antibiotics for viral fever.`,
  workflow: {
    entryNode: "f1",
    nodes: [
      { id: "f1", question: "How long has the fever been present?", options: [
        { label: "Less than 3 days", next: "f2", tags: ["short_duration"] },
        { label: "3–7 days", next: "f2", tags: ["medium_duration"] },
        { label: "More than 7 days", next: "f3", tags: ["prolonged_fever"] },
        { label: "More than 14 days", next: "f3", tags: ["chronic_fever"], redFlag: true, redFlagMessage: "Fever >14 days — consider TB, enteric fever, occult malignancy" },
      ]},
      { id: "f2", question: "Does the child have severe shaking chills or rigors?", options: [
        { label: "Yes — severe shaking episodes", next: "f4", tags: ["rigors"] },
        { label: "Mild chills only", next: "f4", tags: ["chills"] },
        { label: "No chills or rigors", next: "f5", tags: [] },
        { label: "Unsure", next: "f5", tags: [] },
      ]},
      { id: "f3", question: "Any weight loss, night sweats, or contact with a TB patient?", options: [
        { label: "Yes — weight loss or TB contact", next: "f5", tags: ["tb_suspect"], redFlag: true, redFlagMessage: "Prolonged fever + TB risk factors — do Mantoux, CXR, sputum" },
        { label: "Night sweats only", next: "f5", tags: ["night_sweats"] },
        { label: "None of these", next: "f5", tags: [] },
        { label: "Unsure", next: "f5", tags: [] },
      ]},
      { id: "f4", question: "Any bleeding — gums, nose, skin bruising, or dark urine?", options: [
        { label: "Yes — any bleeding noticed", next: "f5", tags: ["bleeding"], redFlag: true, redFlagMessage: "Fever with bleeding — suspect dengue hemorrhagic or platelet disorder; check CBC urgently" },
        { label: "No bleeding", next: "f5", tags: [] },
        { label: "Unsure", next: "f5", tags: [] },
      ]},
      { id: "f5", question: "Any rash on the body?", options: [
        { label: "Yes — red spots or widespread rash", next: "f6", tags: ["rash"] },
        { label: "No rash", next: "f6", tags: [] },
        { label: "Unsure", next: "f6", tags: [] },
      ]},
      { id: "f6", question: "Is there cough or difficulty breathing?", options: [
        { label: "Yes — cough with fast breathing", next: "f7", tags: ["respiratory"], redFlag: true, redFlagMessage: "Fever + respiratory distress — assess for pneumonia" },
        { label: "Cough only, no breathing difficulty", next: "f7", tags: ["cough"] },
        { label: "No respiratory symptoms", next: "f7", tags: [] },
      ]},
      { id: "f7", question: "Any headache or neck stiffness?", options: [
        { label: "Yes — severe headache + neck stiff", next: "f8", tags: ["meningismus"], redFlag: true, redFlagMessage: "Fever + neck stiffness — rule out meningitis; consider LP" },
        { label: "Headache only, no neck stiffness", next: "f8", tags: ["headache"] },
        { label: "No headache or neck stiffness", next: "f8", tags: [] },
      ]},
      { id: "f8", question: "Any vomiting or loose stools?", options: [
        { label: "Yes — vomiting and diarrhea", next: "f9", tags: ["gi_symptoms"] },
        { label: "Vomiting only", next: "f9", tags: ["vomiting"] },
        { label: "Diarrhea only", next: "f9", tags: ["diarrhea"] },
        { label: "No GI symptoms", next: "f9", tags: [] },
      ]},
      { id: "f9", question: "Any burning urination or urinary frequency?", options: [
        { label: "Yes — burning or frequent urination", next: "f10", tags: ["urinary_sx"] },
        { label: "No urinary symptoms", next: "f10", tags: [] },
        { label: "Unsure (young infant)", next: "f10", tags: [] },
      ]},
      { id: "f10", question: "Any travel to malaria-endemic area or dengue outbreak zone in last 4 weeks?", options: [
        { label: "Yes — malaria area", next: "f11", tags: ["malaria_exposure"] },
        { label: "Yes — dengue outbreak area", next: "f11", tags: ["dengue_exposure"] },
        { label: "No travel", next: "f11", tags: [] },
      ]},
      { id: "f11", question: "Is the child's vaccination up to date (DTP, measles, typhoid)?", options: [
        { label: "Fully vaccinated", next: "f12", tags: ["vaccinated"] },
        { label: "Partially or not vaccinated", next: "f12", tags: ["unvaccinated"], redFlag: true, redFlagMessage: "Unvaccinated child with fever — consider measles, typhoid, meningococcal disease" },
        { label: "Not sure", next: "f12", tags: [] },
      ]},
      { id: "f12", question: "How does the child look overall — alert and active, or sick and lethargic?", options: [
        { label: "Alert and playing, drinking well", next: "f_handoff", tags: ["well_appearance"] },
        { label: "Irritable but arousable", next: "f_handoff", tags: ["irritable"] },
        { label: "Lethargic, dull, not interacting", next: "f_handoff", tags: ["lethargic"], redFlag: true, redFlagMessage: "Lethargic child with fever — toxic appearance; consider sepsis workup and early antibiotics" },
        { label: "Unconscious or fits", next: "f_handoff", tags: ["altered"], redFlag: true, redFlagMessage: "Altered consciousness — emergency; secure airway, IV access, glucose, consider meningitis/encephalitis" },
      ]},
      { id: "f_handoff", question: "Structured history complete (12 questions). Would you like AI to analyze the full history and suggest a prioritised differential diagnosis with management?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    // Malaria: rigors + travel are specific; bleeding DECREASES (malaria doesn't cause mucosal bleeding unless severe falciparum)
    "Malaria":      { tags_increase: ["rigors","chills","malaria_exposure"], tags_decrease: ["rash","meningismus","bleeding","urinary_sx","tb_suspect"] },
    // Dengue: rash + bleeding are hallmarks; rigors are NOT typical for dengue
    "Dengue fever": { tags_increase: ["rash","bleeding","dengue_exposure","medium_duration"], tags_decrease: ["rigors","prolonged_fever","tb_suspect","chronic_fever"] },
    "Typhoid":      { tags_increase: ["prolonged_fever","gi_symptoms","medium_duration"], tags_decrease: ["rigors","rash","short_duration"] },
    // Viral fever: short duration, no focus, well-looking child
    "Viral fever":  { tags_increase: ["short_duration","well_appearance","cough","urti_prodrome"], tags_decrease: ["prolonged_fever","rigors","bleeding","meningismus"] },
    "Meningitis":   { tags_increase: ["meningismus","altered","headache"], tags_decrease: ["well_appearance","short_duration"] },
    "UTI":          { tags_increase: ["urinary_sx"], tags_decrease: ["meningismus","bleeding","rigors"] },
    "Pneumonia":    { tags_increase: ["respiratory","cough"], tags_decrease: ["rigors"] },
    "TB":           { tags_increase: ["tb_suspect","chronic_fever","night_sweats","unvaccinated","prolonged_fever"], tags_decrease: ["short_duration","bleeding"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 2. FEVER WITH COUGH
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "fever_cough", name: "Fever with Cough", category: "Respiratory", ageGroup: "pediatric",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["cyanosis","grunting","stridor","apnea","chest indrawing","unable to feed","fast breathing"],
  commonDifferentials: ["Viral URTI","Pneumonia","Bronchiolitis","Asthma","Pertussis","TB","Croup"],
  tags: ["cough","fever","respiratory","chest"],
  clinicalContent: `FEVER WITH COUGH — PEDIATRIC CLINICAL REFERENCE | India OPD

RED FLAGS: RR >60 (<2mo), >50 (2-12mo), >40 (1-5yr) → pneumonia. Grunting/nasal flaring/severe chest indrawing → severe pneumonia. Cyanosis or SpO2 <90% → oxygen STAT. Unable to feed → severe disease. Stridor at rest → croup/epiglottitis. Pertussis in neonate (apnea spells) → admit. Fever >2w with cough → TB.

DIFFERENTIALS: 1. Viral URTI — mild fever, runny nose, mild cough, no distress. 2. Bronchopneumonia — fever, productive cough, tachypnea, crepitations. 3. Bronchiolitis (infants <2yr) — wheeze, tachypnea, low fever; RSV most common. 4. Asthma — recurrent wheeze, family history, responds to salbutamol. 5. Croup — barking cough, inspiratory stridor, worsens at night. 6. Pertussis — paroxysmal cough, post-tussive whoop/vomit, prolonged. 7. TB — chronic cough >3w, contact, FTT, night sweats.

INVESTIGATIONS: CXR if tachypnea/crepitations/suspected pneumonia or TB. CBC, CRP. Mantoux if TB suspected. SpO2 — if <92% hospitalize.

TREATMENT: Viral URTI: symptomatic. CAP (non-severe): amoxicillin 40mg/kg/d x5d. Severe pneumonia: IV ampicillin+gentamicin or ceftriaxone. Asthma: salbutamol nebulization, prednisolone. Croup: dexamethasone 0.15-0.6mg/kg single dose; nebulized adrenaline if severe. Pertussis: azithromycin.`,
  workflow: {
    entryNode: "fc1",
    nodes: [
      { id: "fc1", question: "Is the child breathing fast or struggling to breathe?", options: [
        { label: "Yes — clearly fast or laboured breathing", next: "fc2", tags: ["tachypnea"], redFlag: true, redFlagMessage: "Breathing difficulty detected — count respiratory rate; assess for pneumonia urgently" },
        { label: "Mild difficulty, no obvious distress", next: "fc3", tags: ["mild_distress"] },
        { label: "No — breathing looks normal", next: "fc3", tags: [] },
        { label: "Unsure", next: "fc2", tags: [] },
      ]},
      { id: "fc2", question: "Any bluish discolouration of lips or fingernails (cyanosis)?", options: [
        { label: "Yes — blue lips or nails", next: "fc3", tags: ["cyanosis"], redFlag: true, redFlagMessage: "Cyanosis — hypoxia; oxygen STAT, prepare for emergency management" },
        { label: "Pale but not blue", next: "fc3", tags: ["pallor"] },
        { label: "No cyanosis", next: "fc3", tags: [] },
      ]},
      { id: "fc3", question: "What does the cough sound like?", options: [
        { label: "Barking / seal-like (harsh)", next: "fc4", tags: ["barking_cough","croup"] },
        { label: "Coughing fits followed by whooping or vomiting", next: "fc4", tags: ["whooping","pertussis"] },
        { label: "Wet / rattling / productive", next: "fc4", tags: ["productive"] },
        { label: "Dry / tickling", next: "fc4", tags: ["dry_cough"] },
      ]},
      { id: "fc4", question: "How old is the child and when did this start?", options: [
        { label: "Infant under 1 year, started this week", next: "fc5", tags: ["infant","acute"] },
        { label: "Child 1–5 years, started <1 week", next: "fc5", tags: ["toddler","acute"] },
        { label: "Older child, started <1 week", next: "fc5", tags: ["older_child","acute"] },
        { label: "Any age, going on >2 weeks", next: "fc5", tags: ["chronic_cough"], redFlag: true, redFlagMessage: "Cough >2 weeks — screen for TB, pertussis, asthma" },
      ]},
      { id: "fc5", question: "Is there wheeze (a high-pitched musical sound on breathing out)?", options: [
        { label: "Yes — audible wheeze", next: "fc6", tags: ["wheeze"] },
        { label: "No wheeze", next: "fc6", tags: [] },
        { label: "Unsure", next: "fc6", tags: [] },
      ]},
      { id: "fc6", question: "Is this the first episode or has it happened before?", options: [
        { label: "First episode ever", next: "fc7", tags: ["first_episode"] },
        { label: "Recurrent episodes, same pattern", next: "fc7", tags: ["recurrent","asthma_likely"] },
        { label: "Gets this every winter/cold season", next: "fc7", tags: ["seasonal","asthma_likely"] },
        { label: "Unsure", next: "fc7", tags: [] },
      ]},
      { id: "fc7", question: "Is there a runny nose and sore throat (cold symptoms) before the cough?", options: [
        { label: "Yes — started with cold symptoms", next: "fc8", tags: ["urti_prodrome"] },
        { label: "Cough started without any cold", next: "fc8", tags: ["no_prodrome"] },
        { label: "Sore throat only", next: "fc8", tags: ["sore_throat"] },
      ]},
      { id: "fc8", question: "Is the child able to feed or drink normally?", options: [
        { label: "Yes — feeding / drinking well", next: "fc9", tags: ["feeding_ok"] },
        { label: "Reduced intake but managing", next: "fc9", tags: ["reduced_intake"] },
        { label: "Refusing feeds / unable to drink due to breathing", next: "fc9", tags: ["unable_to_feed"], redFlag: true, redFlagMessage: "Unable to feed — severe respiratory illness; consider hospital admission" },
      ]},
      { id: "fc9", question: "Any contact with a TB patient or prolonged cough in household?", options: [
        { label: "Yes — known TB contact in household", next: "fc10", tags: ["tb_contact"], redFlag: true, redFlagMessage: "TB contact with cough — do Mantoux, CXR; screen for TB" },
        { label: "No TB contacts", next: "fc10", tags: [] },
        { label: "Unsure", next: "fc10", tags: [] },
      ]},
      { id: "fc10", question: "Is the child fully vaccinated — including pertussis (DTP) and measles?", options: [
        { label: "Yes — fully vaccinated", next: "fc_handoff", tags: ["vaccinated"] },
        { label: "No / incompletely vaccinated", next: "fc_handoff", tags: ["unvaccinated"], redFlag: true, redFlagMessage: "Unvaccinated child with cough — consider pertussis, measles" },
        { label: "Not sure", next: "fc_handoff", tags: [] },
      ]},
      { id: "fc_handoff", question: "History complete. Would you like AI to review this respiratory history and give a prioritised differential with management?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Viral URTI":       { tags_increase: ["urti_prodrome","dry_cough","acute","first_episode","feeding_ok"], tags_decrease: ["tachypnea","chronic_cough"] },
    "Bronchopneumonia": { tags_increase: ["tachypnea","productive","unable_to_feed"], tags_decrease: ["dry_cough","wheeze"] },
    "Bronchiolitis":    { tags_increase: ["infant","wheeze","acute","first_episode"], tags_decrease: ["recurrent"] },
    "Asthma":           { tags_increase: ["recurrent","wheeze","seasonal","asthma_likely"], tags_decrease: ["first_episode","productive"] },
    "Croup":            { tags_increase: ["barking_cough"], tags_decrease: ["whooping","wheeze"] },
    "Pertussis":        { tags_increase: ["whooping","chronic_cough","unvaccinated"], tags_decrease: ["acute","urti_prodrome"] },
    "TB":               { tags_increase: ["tb_contact","chronic_cough","no_prodrome"], tags_decrease: ["acute","urti_prodrome"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 3. ACUTE DIARRHEA
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "loose_stools", name: "Loose Motions / Watery Stools", category: "GI", ageGroup: "pediatric",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["blood in stool","sunken eyes","unable to drink","skin pinch","lethargic","seizure"],
  commonDifferentials: ["Acute gastroenteritis (viral)","Shigella dysentery","Cholera","Amoebiasis","Food poisoning","Giardia","Intussusception"],
  tags: ["diarrhea","loose stool","gastro","dehydration"],
  clinicalContent: `ACUTE DIARRHEA — PEDIATRIC CLINICAL REFERENCE | India OPD

DEHYDRATION (IMNCI): None: alert, drinks normally, skin pinch <2s. Some: restless/irritable, sunken eyes, drinks eagerly, pinch 2-3s. Severe: lethargic/unconscious, sunken eyes, unable to drink, pinch >3s.

RED FLAGS: Severe dehydration → IV fluids, hospital. Blood + fever >39°C → antibiotics. Shock → cold peripheries, fast weak pulse. Bile-stained vomiting + distension + no stool → obstruction. Persistent diarrhea in malnourished child → high mortality. Age <2 months → hospital. Seizures → hyponatremia.

DIFFERENTIALS: 1. Rotavirus — profuse watery, vomiting, fever; peak <5yr. 2. Bacterial GE (E.coli, Campylobacter) — fever, mucoid/watery. 3. Shigella — bloody mucoid, high fever, tenesmus; can cause seizures. 4. Amoebiasis — bloody, less fever, insidious. 5. Cholera — rice-water, profuse, severe dehydration, afebrile. 6. Food poisoning — short incubation, vomiting prominent, community cluster. 7. Intussusception — colicky pain, current jelly stool, mass, peak 3-24mo.

TREATMENT: ORS (WHO 75mEq/L) 50-100ml/kg over 3-4h for some dehydration. Zinc 10mg/d (<6mo) or 20mg/d (>6mo) x14d. Continue breastfeeding. Antibiotics ONLY for dysentery (azithromycin) or cholera. IV RL for severe dehydration — 100ml/kg/3h.`,
  workflow: {
    entryNode: "d1",
    nodes: [
      { id: "d1", question: "Is there blood or mucus in the stool?", options: [
        { label: "Yes — visible blood in stool", next: "d2", tags: ["bloody_stool"], redFlag: true, redFlagMessage: "Bloody diarrhea (dysentery) — consider Shigella; antibiotics may be needed" },
        { label: "Mucus only, no frank blood", next: "d3", tags: ["mucoid"] },
        { label: "Watery, no blood or mucus", next: "d3", tags: ["watery"] },
        { label: "Unsure", next: "d3", tags: [] },
      ]},
      { id: "d2", question: "Is there high fever (>39°C) with the bloody stool?", options: [
        { label: "Yes — high fever", next: "d3", tags: ["high_fever","dysentery"] },
        { label: "Low grade or no fever", next: "d3", tags: ["afebrile_bloody"] },
        { label: "Unsure", next: "d3", tags: [] },
      ]},
      { id: "d3", question: "Signs of dehydration — how does the child look?", options: [
        { label: "Alert, drinking well, tears present", next: "d4", tags: ["no_dehydration"] },
        { label: "Irritable, drinking eagerly, eyes slightly sunken", next: "d4", tags: ["some_dehydration"] },
        { label: "Lethargic, unable to drink, eyes very sunken", next: "d4", tags: ["severe_dehydration"], redFlag: true, redFlagMessage: "Severe dehydration — IV fluids urgently; hospital admission" },
        { label: "Unsure", next: "d4", tags: [] },
      ]},
      { id: "d4", question: "How many stools per day, and for how long?", options: [
        { label: "3–6 stools, started 1–2 days ago", next: "d5", tags: ["mild","acute"] },
        { label: "7–10 stools per day", next: "d5", tags: ["moderate"] },
        { label: "More than 10 / profuse watery", next: "d5", tags: ["severe","cholera_possible"] },
        { label: "Going on for 2 weeks or more", next: "d5", tags: ["persistent"], redFlag: true, redFlagMessage: "Persistent diarrhea (>14 days) — evaluate for parasites, malabsorption, HIV" },
      ]},
      { id: "d5", question: "Is there vomiting — and did vomiting start before diarrhea?", options: [
        { label: "Yes — vomiting started first", next: "d6", tags: ["vomiting_first","food_poisoning"] },
        { label: "Vomiting and diarrhea together", next: "d6", tags: ["vomiting"] },
        { label: "Diarrhea only, no vomiting", next: "d6", tags: [] },
        { label: "Unsure", next: "d6", tags: [] },
      ]},
      { id: "d6", question: "Did other family members or people who ate the same food get sick?", options: [
        { label: "Yes — others also fell ill", next: "d7", tags: ["community_cluster","food_poisoning"] },
        { label: "No — only this child affected", next: "d7", tags: [] },
        { label: "Unsure", next: "d7", tags: [] },
      ]},
      { id: "d7", question: "Is the child breastfed, and is breastfeeding continuing?", options: [
        { label: "Yes — breastfeeding, continuing", next: "d8", tags: ["breastfed"] },
        { label: "Breastfeeding but stopped due to illness", next: "d8", tags: ["bf_stopped"] },
        { label: "Not breastfed / older child", next: "d8", tags: [] },
      ]},
      { id: "d8", question: "Any abdominal pain — especially colicky pain with the child drawing up legs?", options: [
        { label: "Yes — severe colicky pain, drawing up legs", next: "d9", tags: ["colicky_pain","intussusception"], redFlag: true, redFlagMessage: "Colicky pain with bloody stool in infant — suspect intussusception; urgent surgical review" },
        { label: "Mild crampy pain", next: "d9", tags: ["crampy"] },
        { label: "No abdominal pain", next: "d9", tags: [] },
      ]},
      { id: "d9", question: "What is the source of drinking water at home?", options: [
        { label: "Piped / treated water", next: "d10", tags: ["treated_water"] },
        { label: "Well / borewell / river / open source", next: "d10", tags: ["contaminated_source"] },
        { label: "Tanker / stored water", next: "d10", tags: ["stored_water"] },
        { label: "Unsure", next: "d10", tags: [] },
      ]},
      { id: "d10", question: "Is the child malnourished or underweight for age?", options: [
        { label: "Yes — visibly thin, or known SAM/MAM", next: "d_handoff", tags: ["malnourished"], redFlag: true, redFlagMessage: "Malnourished child with diarrhea — high mortality risk; low-threshold for admission" },
        { label: "Normal weight for age", next: "d_handoff", tags: ["normal_weight"] },
        { label: "Unsure", next: "d_handoff", tags: [] },
      ]},
      { id: "d_handoff", question: "History complete. Would you like AI to assess this case and suggest a management plan with investigations?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Acute gastroenteritis (viral)": { tags_increase: ["watery","acute","no_dehydration","some_dehydration","vomiting_first"], tags_decrease: ["bloody_stool","persistent"] },
    "Shigella dysentery":            { tags_increase: ["bloody_stool","high_fever","dysentery","colicky_pain"], tags_decrease: ["watery","cholera_possible"] },
    "Cholera":                       { tags_increase: ["severe","cholera_possible","severe_dehydration","contaminated_source"], tags_decrease: ["bloody_stool","vomiting_first"] },
    "Amoebiasis":                    { tags_increase: ["bloody_stool","afebrile_bloody","persistent","contaminated_source"], tags_decrease: ["high_fever","cholera_possible"] },
    "Food poisoning":                { tags_increase: ["vomiting_first","community_cluster","acute"], tags_decrease: ["persistent"] },
    "Giardia":                       { tags_increase: ["persistent","watery","contaminated_source"], tags_decrease: ["bloody_stool","high_fever"] },
    "Intussusception":               { tags_increase: ["colicky_pain","intussusception","bloody_stool"], tags_decrease: ["community_cluster"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 4. FEBRILE SEIZURE
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "febrile_seizure", name: "Child Had a Fit / Convulsion", category: "Neuro", ageGroup: "pediatric",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["focal","prolonged","status","neck stiff","petechiae","not waking","Todd's","repeated seizure"],
  commonDifferentials: ["Simple febrile seizure","Complex febrile seizure","Bacterial meningitis","Viral encephalitis","Cerebral malaria","Hypoglycemia","Hyponatremia","Epilepsy"],
  tags: ["seizure","convulsion","fever","febrile"],
  clinicalContent: `FEBRILE SEIZURE — PEDIATRIC CLINICAL REFERENCE | India OPD/Emergency

DEFINITION: Seizure in child 6mo-5yr associated with fever >38°C, no CNS infection or electrolyte imbalance, no prior afebrile seizures. SIMPLE: generalized, <15min, once in 24h, full recovery in 1h. COMPLEX: focal OR >15min OR >1 episode OR post-ictal deficit.

RED FLAGS: Focal seizure/Todd's palsy → structural pathology. Duration >15min → status epilepticus, admit. >1 seizure in 24h → complex, admit. Post-ictal >1h → meningitis/encephalitis. Neck stiffness/fontanelle bulge/petechiae → meningitis IMMEDIATELY. Age <6mo or >5yr → not typical febrile seizure. Focal neurological deficit → urgent imaging.

DIFFERENTIALS: 1. Simple febrile seizure — most common, benign, 30% recur. 2. Complex febrile seizure — focal, prolonged, multiple. 3. Bacterial meningitis — toxic, meningismus, petechiae. 4. Viral encephalitis — gradual, behavioral change, altered consciousness. 5. Cerebral malaria — P.falciparum endemic area, EMERGENCY. 6. Hypoglycemia — check glucose STAT. 7. Hyponatremia — excess water intake in GE. 8. Epilepsy with fever trigger.

INVESTIGATIONS: Blood glucose STAT (bedside). CBC, CRP. Electrolytes if prolonged/atypical. Malaria smear/RDT in endemic area. LP: NOT routine for simple FS; MUST if <12mo, meningismus, prolonged post-ictal. EEG: NOT acutely needed. CT brain: ONLY if focal signs, raised ICP.

MANAGEMENT: ABC, oxygen, IV diazepam if >5min. Identify/treat fever source. Reassure parents — 98% benign. AED prophylaxis NOT recommended for simple FS.`,
  workflow: {
    entryNode: "fs1",
    nodes: [
      { id: "fs1", question: "Was the seizure affecting both sides of the body equally?", options: [
        { label: "Yes — whole body shaking, both sides equally", next: "fs2", tags: ["generalized"] },
        { label: "No — only one side or one limb affected", next: "fs2", tags: ["focal"], redFlag: true, redFlagMessage: "Focal seizure — not a typical febrile seizure; evaluate for CNS pathology" },
        { label: "Started on one side then spread", next: "fs2", tags: ["focal_to_gen"], redFlag: true, redFlagMessage: "Focal onset seizure — investigate for underlying CNS cause" },
        { label: "Unsure / not witnessed", next: "fs2", tags: [] },
      ]},
      { id: "fs2", question: "How long did the seizure last?", options: [
        { label: "Less than 5 minutes", next: "fs3", tags: ["short_seizure"] },
        { label: "5–15 minutes", next: "fs3", tags: ["medium_seizure"] },
        { label: "More than 15 minutes", next: "fs3", tags: ["prolonged_seizure"], redFlag: true, redFlagMessage: "Prolonged seizure (>15 min) — status epilepticus risk; IV diazepam + hospital admission" },
        { label: "Still ongoing or recurred", next: "fs3", tags: ["ongoing"], redFlag: true, redFlagMessage: "Ongoing/repeated seizures — give diazepam immediately; emergency" },
      ]},
      { id: "fs3", question: "How is the child NOW — after the seizure?", options: [
        { label: "Fully awake and back to normal", next: "fs4", tags: ["full_recovery"] },
        { label: "Drowsy but wakes with stimulation (normal post-ictal)", next: "fs4", tags: ["drowsy"] },
        { label: "Very difficult to wake, confused >1 hour later", next: "fs4", tags: ["altered"], redFlag: true, redFlagMessage: "Prolonged altered consciousness — rule out meningitis or encephalitis urgently" },
        { label: "One arm or leg is weak / not moving", next: "fs4", tags: ["todds"], redFlag: true, redFlagMessage: "Todd's paralysis — focal CNS pathology must be excluded; imaging needed" },
      ]},
      { id: "fs4", question: "Is there neck stiffness, a tense fontanelle, or any skin spots (petechiae)?", options: [
        { label: "Yes — neck stiff or tense fontanelle", next: "fs5", tags: ["meningismus"], redFlag: true, redFlagMessage: "Meningismus — must perform LP after stabilisation; do not delay antibiotics" },
        { label: "Yes — pinpoint red/purple skin spots (petechiae)", next: "fs5", tags: ["petechiae"], redFlag: true, redFlagMessage: "Petechiae + fever + seizure — meningococcemia; ceftriaxone immediately, emergency" },
        { label: "No — neither of these", next: "fs5", tags: [] },
        { label: "Unsure / not checked", next: "fs5", tags: [] },
      ]},
      { id: "fs5", question: "What is the child's age?", options: [
        { label: "6 months to 5 years (typical age range)", next: "fs6", tags: ["typical_age"] },
        { label: "Under 6 months", next: "fs6", tags: ["very_young"], redFlag: true, redFlagMessage: "Seizure in child under 6 months — not a typical febrile seizure; full workup needed" },
        { label: "Over 5 years", next: "fs6", tags: ["older_child"], redFlag: true, redFlagMessage: "Seizure in child over 5 years with fever — not a typical febrile seizure; evaluate for epilepsy or CNS infection" },
      ]},
      { id: "fs6", question: "How many febrile seizures has this child had in total (lifetime)?", options: [
        { label: "This is the first one ever", next: "fs7", tags: ["first_episode"] },
        { label: "2–4 previous febrile seizures", next: "fs7", tags: ["recurrent_fs"] },
        { label: "More than 4 previous episodes", next: "fs7", tags: ["multiple_fs"], redFlag: true, redFlagMessage: "Multiple recurrent febrile seizures — assess for febrile seizure threshold; consider neurology referral" },
      ]},
      { id: "fs7", question: "Is there a family history of febrile seizures or epilepsy?", options: [
        { label: "Yes — febrile seizures in parents or siblings", next: "fs8", tags: ["family_fs"] },
        { label: "Yes — epilepsy in the family", next: "fs8", tags: ["family_epilepsy"] },
        { label: "No family history", next: "fs8", tags: [] },
        { label: "Unsure", next: "fs8", tags: [] },
      ]},
      { id: "fs8", question: "Is the child's development otherwise normal for age?", options: [
        { label: "Yes — normal development", next: "fs9", tags: ["normal_dev"] },
        { label: "Some developmental concerns or delays", next: "fs9", tags: ["dev_delay"], redFlag: true, redFlagMessage: "Developmental delay with seizure — higher risk of epilepsy; refer to paediatric neurology" },
        { label: "Unsure", next: "fs9", tags: [] },
      ]},
      { id: "fs9", question: "Is there a known source of fever (e.g. ear infection, URTI, gastroenteritis)?", options: [
        { label: "Yes — clear source identified", next: "fs_handoff", tags: ["fever_source_found"] },
        { label: "No obvious source of fever", next: "fs_handoff", tags: ["fever_without_source"] },
        { label: "Unsure", next: "fs_handoff", tags: [] },
      ]},
      { id: "fs_handoff", question: "History complete. Would you like AI to review this seizure case and advise on workup and management?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Simple febrile seizure":   { tags_increase: ["generalized","short_seizure","full_recovery","typical_age","first_episode"], tags_decrease: ["focal","prolonged_seizure","meningismus"] },
    "Complex febrile seizure":  { tags_increase: ["focal_to_gen","medium_seizure","prolonged_seizure","recurrent_fs"], tags_decrease: ["full_recovery"] },
    "Bacterial meningitis":     { tags_increase: ["meningismus","petechiae","altered","fever_without_source"], tags_decrease: ["full_recovery","typical_age"] },
    "Viral encephalitis":       { tags_increase: ["altered","fever_without_source"], tags_decrease: ["full_recovery"] },
    "Cerebral malaria":         { tags_increase: ["altered","ongoing"], tags_decrease: [] },
    "Hypoglycemia":             { tags_increase: ["altered","very_young"], tags_decrease: ["meningismus"] },
    "Epilepsy":                 { tags_increase: ["multiple_fs","dev_delay","family_epilepsy","older_child","focal"], tags_decrease: ["first_episode","typical_age"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 5. BURNING URINATION / UTI
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "uti_pediatric", name: "Burning / Painful Urination", category: "Urinary", ageGroup: "pediatric",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["high fever","loin pain","vomiting","recurrent","hypertension","poor growth"],
  commonDifferentials: ["Lower UTI / Cystitis","Pyelonephritis","Vulvovaginitis","Urethritis","Dysfunctional voiding","Appendicitis","Renal calculi"],
  tags: ["UTI","dysuria","burning","urinary","urine"],
  clinicalContent: `UTI — PEDIATRIC CLINICAL REFERENCE | India OPD

RED FLAGS: Fever >39°C + UTI in child <2yr → pyelonephritis. Sepsis signs: toxic, poor perfusion, altered sensorium. Recurrent UTI in any male → anatomical anomaly. Recurrent UTI in female <3yr → renal ultrasound. Failure to respond to antibiotics after 48h. Hypertension with UTI → renal scarring.

DIFFERENTIALS: 1. Lower UTI/Cystitis — dysuria, frequency, urgency, no/low fever. 2. Pyelonephritis — high fever, systemic illness, flank pain, vomiting. 3. Vulvovaginitis — discharge, redness, dysuria without frequency (girls). 4. Pinworm — perianal itching, dysuria in girls. 5. Chemical irritation — soaps, bubble bath. 6. Dysfunctional voiding — frequency/urgency, no infection. 7. Appendicitis — can mimic UTI with dysuria + abdominal pain. 8. Renal calculi — hematuria + colicky pain.

INVESTIGATIONS: Urine dipstick: leucocyte esterase + nitrite = high specificity. Urine microscopy and culture — clean catch midstream; >10 WBC/hpf = pyuria. Blood culture if febrile UTI in <3 months. Renal ultrasound for first UTI in male, child <2yr, recurrent UTI.

TREATMENT: Lower UTI: cotrimoxazole or nitrofurantoin 5-7d. Pyelonephritis: cefixime oral or ceftriaxone IV. Neonatal UTI: always admit for IV antibiotics. Note: E.coli resistance to amoxicillin is high in India — avoid empirically.`,
  workflow: {
    entryNode: "u1",
    nodes: [
      { id: "u1", question: "Does the child have pain or burning when passing urine?", options: [
        { label: "Yes — clear burning or pain on urination", next: "u2", tags: ["dysuria"] },
        { label: "Cries during urination (infant)", next: "u2", tags: ["dysuria","infant"] },
        { label: "Frequency or urgency only, no pain", next: "u2", tags: ["frequency"] },
        { label: "No urinary symptoms — just fever", next: "u3", tags: ["fever_only"] },
      ]},
      { id: "u2", question: "Is there high fever (above 39°C) or loin / back pain?", options: [
        { label: "Yes — high fever + back or loin pain", next: "u3", tags: ["pyelonephritis"], redFlag: true, redFlagMessage: "Pyelonephritis likely — IV antibiotics may be needed; check renal function and blood culture" },
        { label: "High fever without loin pain", next: "u3", tags: ["high_fever"] },
        { label: "Low grade or no fever", next: "u3", tags: ["afebrile"] },
        { label: "Unsure", next: "u3", tags: [] },
      ]},
      { id: "u3", question: "Has the child had UTI before?", options: [
        { label: "Yes — recurrent episodes (2 or more)", next: "u4", tags: ["recurrent_uti"], redFlag: true, redFlagMessage: "Recurrent UTI — investigate for VUR, anatomical anomaly; renal ultrasound and VCUG if needed" },
        { label: "This is the first episode", next: "u4", tags: ["first_uti"] },
        { label: "Unsure", next: "u4", tags: [] },
      ]},
      { id: "u4", question: "Is there foul-smelling or cloudy urine?", options: [
        { label: "Yes — clearly foul-smelling or cloudy", next: "u5", tags: ["cloudy_urine"] },
        { label: "No — urine looks normal", next: "u5", tags: [] },
        { label: "Any blood in urine noticed?", next: "u5", tags: ["hematuria"] },
        { label: "Unsure", next: "u5", tags: [] },
      ]},
      { id: "u5", question: "Is the child passing less urine than usual, or last urination was more than 8 hours ago?", options: [
        { label: "Yes — much less urine or none for 8+ hours", next: "u6", tags: ["oliguria"], redFlag: true, redFlagMessage: "Oliguria with UTI symptoms — assess hydration; consider renal involvement or dehydration" },
        { label: "Urinating more frequently than usual", next: "u6", tags: ["polyuria"] },
        { label: "Normal urine output", next: "u6", tags: [] },
        { label: "Unsure", next: "u6", tags: [] },
      ]},
      { id: "u6", question: "Any constipation history? (Constipation is a major risk factor for UTI in children)", options: [
        { label: "Yes — chronic or frequent constipation", next: "u7", tags: ["constipation"] },
        { label: "No — normal bowel habits", next: "u7", tags: [] },
        { label: "Unsure", next: "u7", tags: [] },
      ]},
      { id: "u7", question: "For girls — any vaginal discharge or redness around genitals?", options: [
        { label: "Yes — discharge or redness present", next: "u8", tags: ["genital_irritation","vulvovaginitis"] },
        { label: "No discharge or redness", next: "u8", tags: [] },
        { label: "Male child / not applicable", next: "u8", tags: [] },
      ]},
      { id: "u8", question: "Any recent use of soaps, bubble bath, or irritants near genitals?", options: [
        { label: "Yes — bubble bath or soap used frequently", next: "u9", tags: ["chemical_irritation"] },
        { label: "No recent change in hygiene products", next: "u9", tags: [] },
        { label: "Unsure", next: "u9", tags: [] },
      ]},
      { id: "u9", question: "Is the child's blood pressure normal (if checked)?", options: [
        { label: "Yes — normal blood pressure", next: "u_handoff", tags: [] },
        { label: "High blood pressure detected", next: "u_handoff", tags: ["hypertension"], redFlag: true, redFlagMessage: "Hypertension + UTI — suspect renal scarring from previous UTIs; nephrology referral" },
        { label: "Blood pressure not checked", next: "u_handoff", tags: [] },
      ]},
      { id: "u_handoff", question: "History complete. Would you like AI to assess this urinary case and suggest investigations and treatment?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Lower UTI / Cystitis": { tags_increase: ["dysuria","frequency","afebrile","first_uti","cloudy_urine"], tags_decrease: ["pyelonephritis","high_fever"] },
    "Pyelonephritis":       { tags_increase: ["pyelonephritis","high_fever","oliguria","recurrent_uti"], tags_decrease: ["afebrile","chemical_irritation"] },
    "Vulvovaginitis":       { tags_increase: ["genital_irritation","vulvovaginitis","chemical_irritation","dysuria","afebrile"], tags_decrease: ["high_fever","pyelonephritis"] },
    "Dysfunctional voiding": { tags_increase: ["frequency","constipation","recurrent_uti"], tags_decrease: ["high_fever","dysuria"] },
    "Renal calculi":         { tags_increase: ["hematuria","oliguria"], tags_decrease: ["afebrile"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 6. PALLOR / ANEMIA
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "pallor_anemia", name: "Child Looks Pale", category: "Hematology", ageGroup: "all",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["severe pallor","bleeding","jaundice","lymph nodes","bone pain","weight loss","petechiae","splenomegaly"],
  commonDifferentials: ["Iron deficiency anemia","Megaloblastic anemia","Thalassemia","Sickle cell disease","Malaria","Hookworm anemia","G6PD hemolysis","Aplastic anemia","Leukemia"],
  tags: ["pallor","anemia","hemoglobin","iron"],
  clinicalContent: `PALLOR/ANEMIA — CLINICAL REFERENCE | India OPD

DEFINITION: Pallor suggests Hb <11g/dL (children <5yr), <11.5g/dL (5-11yr), <12g/dL (girls), <13g/dL (adult males).

RED FLAGS: Severe pallor (Hb likely <5) + tachycardia → emergency transfusion. Jaundice + fever + pallor → acute hemolysis. Pallor + bone pain + lymphadenopathy → leukemia screen urgent. Petechiae + pallor → bone marrow failure. Pallor + splenomegaly → thalassemia/malaria/kala-azar.

DIFFERENTIALS: 1. Iron deficiency — most common in India; dietary, worm infestation, blood loss. 2. Megaloblastic (B12/folate) — macrocytic; vegan diet, malabsorption. 3. Thalassemia — microcytic; splenomegaly, family history; prevalent in many Indian states. 4. Sickle cell — tribal populations; painful crises, dactylitis in infants. 5. Malaria — acute hemolysis; fever + pallor + splenomegaly. 6. G6PD deficiency — hemolysis after drug/infection. 7. Aplastic anemia — pancytopenia, petechiae. 8. Hookworm — chronic blood loss, rural India. 9. Leukemia — pancytopenia, bone pain, lymphadenopathy.

INVESTIGATIONS: CBC with indices (MCV), peripheral smear, reticulocyte count, serum ferritin+iron+TIBC, malaria smear, LFT+bilirubin, Hb electrophoresis (thalassemia/sickle cell), stool for O&P (hookworm).

TREATMENT: Iron deficiency: elemental iron 3-6mg/kg/d x3mo. B12: IM or oral supplementation. Thalassemia major: regular transfusions + chelation. Malaria anemia: treat malaria; transfuse if Hb <5. Hookworm: albendazole 400mg single dose.`,
  workflow: {
    entryNode: "p1",
    nodes: [
      { id: "p1", question: "How long has the pallor or paleness been noticed?", options: [
        { label: "Sudden — noticed in last few days", next: "p2", tags: ["acute_pallor"] },
        { label: "Gradually over weeks to months", next: "p3", tags: ["chronic_pallor"] },
        { label: "Always been pale (from birth or very early)", next: "p3", tags: ["congenital"] },
        { label: "Unsure", next: "p3", tags: [] },
      ]},
      { id: "p2", question: "Is there jaundice (yellow eyes or skin) or dark / cola-coloured urine?", options: [
        { label: "Yes — yellow eyes or skin", next: "p3", tags: ["jaundice","hemolysis"], redFlag: true, redFlagMessage: "Acute pallor + jaundice — hemolytic anemia; check malaria smear, G6PD, LFT urgently" },
        { label: "Dark or cola-coloured urine", next: "p3", tags: ["hemoglobinuria"], redFlag: true, redFlagMessage: "Hemoglobinuria — severe intravascular hemolysis; urgent" },
        { label: "No jaundice", next: "p3", tags: [] },
      ]},
      { id: "p3", question: "Any bone pain, swollen lymph glands, or unexplained weight loss?", options: [
        { label: "Bone pain or tenderness", next: "p4", tags: ["bone_pain"], redFlag: true, redFlagMessage: "Pallor + bone pain — screen for leukemia; urgent CBC and peripheral smear" },
        { label: "Swollen lymph glands", next: "p4", tags: ["lymphadenopathy"], redFlag: true, redFlagMessage: "Pallor + lymphadenopathy — leukemia/lymphoma must be excluded" },
        { label: "Weight loss without obvious cause", next: "p4", tags: ["weight_loss"] },
        { label: "None of these", next: "p4", tags: [] },
      ]},
      { id: "p4", question: "Tell me about the child's diet — is it iron-rich or predominantly vegetarian?", options: [
        { label: "Mainly vegetarian, little meat or eggs", next: "p5", tags: ["veg_diet","iron_poor"] },
        { label: "Excess cow's milk (>500mL/day) in infant/toddler", next: "p5", tags: ["milk_excess","iron_poor"] },
        { label: "Mixed diet with meat, fish, or eggs", next: "p5", tags: ["mixed_diet"] },
        { label: "Poor diet overall / food insecure", next: "p5", tags: ["poor_diet","iron_poor"] },
      ]},
      { id: "p5", question: "Any recurrent fever, and is there spleen enlargement felt in the abdomen?", options: [
        { label: "Yes — recurrent fever + big belly (splenomegaly)", next: "p6", tags: ["splenomegaly","recurrent_fever"] },
        { label: "Recurrent fever without obvious splenomegaly", next: "p6", tags: ["recurrent_fever"] },
        { label: "No fever, no splenomegaly", next: "p6", tags: [] },
        { label: "Unsure", next: "p6", tags: [] },
      ]},
      { id: "p6", question: "Is there a family history of anemia, blood disorders, or known thalassemia/sickle cell?", options: [
        { label: "Yes — thalassemia or sickle cell in family", next: "p7", tags: ["family_hemoglobin"] },
        { label: "Yes — general anemia in family members", next: "p7", tags: ["family_anemia"] },
        { label: "No family history of blood disorders", next: "p7", tags: [] },
        { label: "Unsure", next: "p7", tags: [] },
      ]},
      { id: "p7", question: "Any skin spots (petechiae or purpura) or bleeding from gums or nose?", options: [
        { label: "Yes — petechiae, purpura, or bleeding", next: "p8", tags: ["bleeding_tendency"], redFlag: true, redFlagMessage: "Pallor + bleeding signs — aplastic anemia or leukemia; urgent bone marrow evaluation" },
        { label: "No bleeding tendency", next: "p8", tags: [] },
      ]},
      { id: "p8", question: "Does the child eat mud, clay, or non-food items (pica)?", options: [
        { label: "Yes — eats mud or clay (pica)", next: "p9", tags: ["pica","iron_deficiency"] },
        { label: "No pica", next: "p9", tags: [] },
        { label: "Unsure", next: "p9", tags: [] },
      ]},
      { id: "p9", question: "Any worm infestation noticed, or does the child walk barefoot on soil frequently?", options: [
        { label: "Yes — worms seen or suspected", next: "p_handoff", tags: ["hookworm"] },
        { label: "Frequently walks barefoot on soil (rural area)", next: "p_handoff", tags: ["hookworm"] },
        { label: "No worm exposure", next: "p_handoff", tags: [] },
        { label: "Unsure", next: "p_handoff", tags: [] },
      ]},
      { id: "p_handoff", question: "History complete. Would you like AI to analyse the pallor history and recommend investigations and management?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Iron deficiency anemia": { tags_increase: ["chronic_pallor","iron_poor","veg_diet","milk_excess","pica","hookworm","poor_diet"], tags_decrease: ["jaundice","bone_pain","splenomegaly"] },
    "Thalassemia":            { tags_increase: ["congenital","chronic_pallor","family_hemoglobin","splenomegaly"], tags_decrease: ["acute_pallor"] },
    "Sickle cell disease":    { tags_increase: ["family_hemoglobin","bone_pain","congenital","splenomegaly"], tags_decrease: ["iron_poor"] },
    "Malaria":                { tags_increase: ["acute_pallor","jaundice","recurrent_fever","splenomegaly"], tags_decrease: ["chronic_pallor"] },
    "G6PD hemolysis":         { tags_increase: ["acute_pallor","jaundice","hemoglobinuria"], tags_decrease: ["chronic_pallor"] },
    "Megaloblastic anemia":   { tags_increase: ["chronic_pallor","veg_diet"], tags_decrease: ["jaundice","splenomegaly"] },
    "Aplastic anemia":        { tags_increase: ["bleeding_tendency","acute_pallor"], tags_decrease: ["splenomegaly","iron_poor"] },
    "Hookworm anemia":        { tags_increase: ["hookworm","chronic_pallor","iron_poor"], tags_decrease: ["acute_pallor"] },
    "Leukemia":               { tags_increase: ["bone_pain","lymphadenopathy","bleeding_tendency"], tags_decrease: ["iron_poor"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 7. FEVER WITH RASH
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "rash_fever", name: "Fever with Rash", category: "Skin", ageGroup: "pediatric",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["petechiae","purpura","non-blanching","mouth sores","eye discharge","palms soles","mucosal"],
  commonDifferentials: ["Viral exanthem","Roseola infantum","Dengue","Measles","Chickenpox","Scarlet fever","Meningococcemia","Kawasaki disease","Chikungunya","HFMD"],
  tags: ["rash","fever","exanthem","skin","spots"],
  clinicalContent: `FEVER WITH RASH — PEDIATRIC CLINICAL REFERENCE | India OPD

CRITICAL FIRST: Glass test — press glass on rash: disappears = blanching (usually benign); stays visible = NON-BLANCHING → petechiae/purpura → EMERGENCY (meningococcemia, vasculitis).

TIMING: Day 1 rash = measles, scarlet fever, roseola. Day 3-5 = dengue. Rash after fever falls (day 3-4) = roseola (classic). With joint pain = chikungunya, JIA. Progressive crops: vesicles→pustules→crusts = chickenpox.

RED FLAGS: Non-blanching rash + fever → meningococcemia EMERGENCY. Kawasaki criteria: fever >5d + 4 of (rash, conjunctivitis, lip changes, lymphadenopathy, hand/foot changes) → IVIG needed. Blistering rash in neonate → SSSS, neonatal herpes, EMERGENCY.

DIFFERENTIALS: 1. Viral exanthem — macular/papular, blanching, self-limiting. 2. Roseola (HHV-6) — high fever 3-5d then rash as fever breaks; 6-24mo. 3. Measles — prodrome cough/coryza/conjunctivitis, Koplik spots, morbilliform rash spreading face→down. 4. Chickenpox — all-stage lesions, intensely itchy, centripetal. 5. Dengue — macular with islands of normal skin, thrombocytopenia. 6. Scarlet fever — sandpaper texture, circumoral pallor, strawberry tongue. 7. Chikungunya — fever + severe joint pain + rash. 8. Meningococcemia — purpuric, non-blanching, rapidly progressive, EMERGENCY. 9. Kawasaki — fever >5d + mucocutaneous features. 10. HFMD — vesicles on palms, soles, oral ulcers.

TREATMENT: Chickenpox: acyclovir if immunocompromised/severe; calamine, antihistamine. Measles: Vitamin A 200,000IU x2d. Scarlet fever: penicillin V or amoxicillin 10d. Kawasaki: aspirin + IVIG — refer urgently. Dengue: symptomatic, avoid NSAIDs.`,
  workflow: {
    entryNode: "r1",
    nodes: [
      { id: "r1", question: "Press a glass firmly on the rash — does it disappear completely?", options: [
        { label: "Yes — rash completely disappears under glass", next: "r2", tags: ["blanching"] },
        { label: "No — rash stays visible despite pressure (non-blanching)", next: "r2", tags: ["non_blanching"], redFlag: true, redFlagMessage: "NON-BLANCHING RASH — suspect meningococcemia; give ceftriaxone IMMEDIATELY, transfer to hospital" },
        { label: "Mixed / some parts disappear, some stay", next: "r2", tags: [] },
        { label: "Unable to check / unsure", next: "r2", tags: [] },
      ]},
      { id: "r2", question: "When did the rash appear relative to the fever?", options: [
        { label: "Same day as fever started", next: "r3", tags: ["rash_day1"] },
        { label: "Rash appeared AFTER fever came down (day 3–4)", next: "r3", tags: ["rash_after_fever","roseola"] },
        { label: "Rash appeared on day 3–5 of high fever", next: "r3", tags: ["rash_delayed","dengue_timing"] },
        { label: "Unsure of timing", next: "r3", tags: [] },
      ]},
      { id: "r3", question: "What does the rash look like?", options: [
        { label: "Fluid-filled blisters (vesicles) in different stages", next: "r4", tags: ["vesicular","chickenpox"] },
        { label: "Flat red spots or small raised bumps (maculopapular)", next: "r4", tags: ["maculopapular"] },
        { label: "Rough sandpaper texture, widespread red flush", next: "r4", tags: ["scarlatiniform","scarlet_fever"] },
        { label: "Tiny red/purple pinpoints", next: "r4", tags: ["petechiae_like"], redFlag: true, redFlagMessage: "Petechiae-like rash — do glass test immediately; if non-blanching → meningococcemia" },
      ]},
      { id: "r4", question: "Is the rash intensely itchy?", options: [
        { label: "Yes — very itchy, child scratching", next: "r5", tags: ["pruritic","chickenpox"] },
        { label: "Mildly itchy", next: "r5", tags: ["mild_itch"] },
        { label: "Not itchy at all", next: "r5", tags: ["non_pruritic"] },
      ]},
      { id: "r5", question: "Was there cough, runny nose, and RED EYES (conjunctivitis) BEFORE the rash appeared?", options: [
        { label: "Yes — all three: cough + cold + red eyes", next: "r6", tags: ["measles_prodrome","measles"] },
        { label: "Red eyes only (no cough/cold)", next: "r6", tags: ["conjunctivitis"] },
        { label: "None of these — just fever then rash", next: "r6", tags: [] },
      ]},
      { id: "r6", question: "Any severe joint pain with the rash?", options: [
        { label: "Yes — severe joint pains, can barely walk", next: "r7", tags: ["arthralgia","chikungunya"] },
        { label: "Mild joint pain", next: "r7", tags: ["mild_arthralgia"] },
        { label: "No joint pain", next: "r7", tags: [] },
      ]},
      { id: "r7", question: "Any sore throat before the rash, or whitish coating on tongue?", options: [
        { label: "Yes — sore throat + rough red sandpaper rash", next: "r8", tags: ["sore_throat","scarlet_fever"] },
        { label: "White coating on tongue (strawberry tongue)", next: "r8", tags: ["strawberry_tongue","scarlet_fever"] },
        { label: "No throat symptoms", next: "r8", tags: [] },
      ]},
      { id: "r8", question: "Is the child's vaccination up to date — especially measles (MMR) and chickenpox?", options: [
        { label: "Yes — fully vaccinated including measles", next: "r9", tags: ["vaccinated"] },
        { label: "No — not vaccinated or incomplete", next: "r9", tags: ["unvaccinated"], redFlag: true, redFlagMessage: "Unvaccinated child with fever and rash — measles must be considered; notify health authorities" },
        { label: "Unsure", next: "r9", tags: [] },
      ]},
      { id: "r9", question: "Has the child had fever for more than 5 days, along with red eyes and lip/tongue changes?", options: [
        { label: "Yes — fever >5 days + red eyes + red cracked lips", next: "r_handoff", tags: ["kawasaki_criteria"], redFlag: true, redFlagMessage: "Kawasaki disease criteria met — IVIG + aspirin urgently; refer to paediatric cardiologist" },
        { label: "Fever <5 days or without mucosal changes", next: "r_handoff", tags: [] },
        { label: "Unsure", next: "r_handoff", tags: [] },
      ]},
      { id: "r_handoff", question: "History complete. Would you like AI to assess this rash case and suggest a diagnosis with management?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Chickenpox":        { tags_increase: ["vesicular","pruritic","chickenpox"], tags_decrease: ["non_blanching","scarlatiniform"] },
    "Measles":           { tags_increase: ["measles_prodrome","maculopapular","rash_day1","unvaccinated"], tags_decrease: ["vesicular","pruritic"] },
    "Roseola infantum":  { tags_increase: ["rash_after_fever","maculopapular"], tags_decrease: ["vesicular","non_blanching"] },
    "Meningococcemia":   { tags_increase: ["non_blanching","petechiae_like"], tags_decrease: ["blanching","pruritic"] },
    "Dengue fever":      { tags_increase: ["dengue_timing","maculopapular","non_pruritic"], tags_decrease: ["vesicular","pruritic"] },
    "Chikungunya":       { tags_increase: ["arthralgia","chikungunya","maculopapular"], tags_decrease: ["vesicular"] },
    "Scarlet fever":     { tags_increase: ["scarlatiniform","sore_throat","scarlet_fever","strawberry_tongue"], tags_decrease: ["vesicular","rash_after_fever"] },
    "Viral exanthem":    { tags_increase: ["maculopapular","blanching","vaccinated"], tags_decrease: ["non_blanching","arthralgia"] },
    "Kawasaki disease":  { tags_increase: ["kawasaki_criteria","conjunctivitis"], tags_decrease: ["vesicular","pruritic"] },
    "HFMD":              { tags_increase: ["vesicular","maculopapular"], tags_decrease: ["non_blanching"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 8. ABDOMINAL PAIN — ACUTE
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "abdominal_pain_acute", name: "Stomach Pain / Abdominal Pain", category: "GI", ageGroup: "all",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["rigid abdomen","rebound","guarding","bile vomiting","no stool","peritonitis","mass","blood stool"],
  commonDifferentials: ["Mesenteric lymphadenitis","Acute appendicitis","Gastroenteritis","Intussusception","Constipation","UTI","Renal calculi","Pancreatitis","Ovarian cyst"],
  tags: ["abdominal pain","stomach pain","abdomen","GI"],
  clinicalContent: `ABDOMINAL PAIN ACUTE — CLINICAL REFERENCE | India OPD

RED FLAGS (SURGICAL ABDOMEN): Rigid board-like abdomen → peritonitis. Rebound tenderness + guarding → appendicitis/peritonitis. Bilious (green) vomiting in infant → malrotation/volvulus EMERGENCY. No bowel movements + distension + vomiting → obstruction. Palpable sausage mass in RIF → intussusception. Severe constant pain + hemodynamic instability → perforation.

DIFFERENTIALS: 1. Mesenteric lymphadenitis — commonest in children; periumbilical pain, mild fever, recent URTI; no guarding. 2. Acute appendicitis — periumbilical→RIF migration; anorexia; rebound; Rovsing's sign. 3. Gastroenteritis — crampy pain, diarrhea, vomiting, fever; diffuse without guarding. 4. Intussusception — colicky pain, drawing-up legs, current jelly stool, mass; peak 3-24 months. 5. Constipation — crampy pain, hard stool; common, underdiagnosed. 6. UTI — suprapubic pain, dysuria, fever. 7. Renal calculi — severe loin→groin pain, hematuria. 8. DKA — abdominal pain prominent; check glucose. 9. HSP — colicky pain, purpuric rash buttocks/legs, arthritis, hematuria. 10. Sickle cell crisis — known sickler, recurrent.

INVESTIGATIONS: CBC, CRP (appendicitis/adenitis), urine dipstick (UTI), blood glucose (DKA), amylase/lipase (pancreatitis), pregnancy test (girls >12yr), ultrasound abdomen FIRST LINE, erect CXR (free gas/obstruction).

TREATMENT: Mesenteric adenitis: symptomatic. Appendicitis: surgical referral, IV antibiotics. Intussusception: pneumatic/hydrostatic reduction; surgery if failed. Gastroenteritis: ORS. Constipation: lactulose, laxatives.`,
  workflow: {
    entryNode: "ap1",
    nodes: [
      { id: "ap1", question: "Where is the pain mainly located?", options: [
        { label: "Around the navel, now shifting to lower right (RIF)", next: "ap2", tags: ["rif_pain","appendicitis"] },
        { label: "Lower right side (RIF) from the start", next: "ap2", tags: ["rif_pain"] },
        { label: "All over / diffuse / generalised", next: "ap3", tags: ["diffuse_pain"] },
        { label: "Upper abdomen / epigastric", next: "ap3", tags: ["epigastric"] },
      ]},
      { id: "ap2", question: "Is there fever AND has the child stopped eating (anorexia)?", options: [
        { label: "Yes — fever + loss of appetite", next: "ap3", tags: ["appendicitis_likely","fever","anorexia"], redFlag: true, redFlagMessage: "RIF pain + fever + anorexia — appendicitis until proven otherwise; surgical review urgently" },
        { label: "Fever but still eating", next: "ap3", tags: ["fever"] },
        { label: "No fever, still eating", next: "ap3", tags: [] },
      ]},
      { id: "ap3", question: "Is the abdomen hard or rigid? Does the child resist or cry when you touch the tummy?", options: [
        { label: "Yes — rigid, guards or rebound on touching", next: "ap4", tags: ["guarding"], redFlag: true, redFlagMessage: "Guarding / rigidity — peritonitis; surgical emergency; do not delay" },
        { label: "Tender but soft abdomen", next: "ap4", tags: ["tender_soft"] },
        { label: "No tenderness when examined", next: "ap4", tags: ["no_tenderness"] },
      ]},
      { id: "ap4", question: "Any vomiting — and is it green / bile-coloured?", options: [
        { label: "Yes — green or bile-coloured vomiting", next: "ap5", tags: ["bilious_vomiting"], redFlag: true, redFlagMessage: "Bilious vomiting — suspect intestinal obstruction or malrotation; urgent surgical review" },
        { label: "Vomiting but not green / yellow", next: "ap5", tags: ["vomiting"] },
        { label: "No vomiting", next: "ap5", tags: [] },
      ]},
      { id: "ap5", question: "What is the character of the pain?", options: [
        { label: "Colicky — comes and goes in waves", next: "ap6", tags: ["colicky"] },
        { label: "Constant and persistent", next: "ap6", tags: ["constant_pain"] },
        { label: "Crampy with diarrhea", next: "ap6", tags: ["crampy","gastroenteritis"] },
        { label: "Mild or vague", next: "ap6", tags: ["vague"] },
      ]},
      { id: "ap6", question: "Any change in bowel habit — constipation or diarrhea?", options: [
        { label: "Diarrhea with the pain", next: "ap7", tags: ["diarrhea"] },
        { label: "Constipated — no stool for 3+ days", next: "ap7", tags: ["constipated"] },
        { label: "Normal bowel habit", next: "ap7", tags: [] },
        { label: "Current jelly / bloody stool (dark red)", next: "ap7", tags: ["current_jelly","intussusception"], redFlag: true, redFlagMessage: "Current jelly stool + colicky pain in infant — intussusception; urgent surgical referral" },
      ]},
      { id: "ap7", question: "Any burning urination or urinary frequency with the abdominal pain?", options: [
        { label: "Yes — urinary symptoms present", next: "ap8", tags: ["urinary_sx"] },
        { label: "No urinary symptoms", next: "ap8", tags: [] },
        { label: "Unsure", next: "ap8", tags: [] },
      ]},
      { id: "ap8", question: "Did this start suddenly and severely (like a 'blow'), or gradually over hours?", options: [
        { label: "Sudden and very severe onset", next: "ap9", tags: ["sudden_onset"], redFlag: true, redFlagMessage: "Sudden severe abdominal pain — consider perforation, volvulus, or renal colic; emergency" },
        { label: "Gradual worsening over several hours", next: "ap9", tags: ["gradual_onset"] },
        { label: "Vague pain that comes and goes for days", next: "ap9", tags: ["recurrent"] },
      ]},
      { id: "ap9", question: "Was there a recent URTI or sore throat 1–2 weeks ago?", options: [
        { label: "Yes — URTI or sore throat recently", next: "ap_handoff", tags: ["recent_urti","mesenteric_adenitis"] },
        { label: "No recent URTI", next: "ap_handoff", tags: [] },
        { label: "Unsure", next: "ap_handoff", tags: [] },
      ]},
      { id: "ap_handoff", question: "History complete. Would you like AI to assess this abdominal pain case and advise on diagnosis and management?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Acute appendicitis":       { tags_increase: ["rif_pain","appendicitis_likely","fever","anorexia","constant_pain","guarding","sudden_onset"], tags_decrease: ["diffuse_pain","diarrhea","no_tenderness"] },
    "Mesenteric lymphadenitis": { tags_increase: ["rif_pain","fever","tender_soft","recent_urti","mesenteric_adenitis"], tags_decrease: ["guarding","bilious_vomiting"] },
    "Gastroenteritis":          { tags_increase: ["diffuse_pain","diarrhea","crampy","gastroenteritis","vomiting"], tags_decrease: ["guarding","rif_pain"] },
    "Intussusception":          { tags_increase: ["current_jelly","intussusception","colicky","bilious_vomiting"], tags_decrease: ["no_tenderness","recurrent"] },
    "Constipation":             { tags_increase: ["constipated","vague","recurrent"], tags_decrease: ["guarding","fever","bilious_vomiting"] },
    "UTI":                      { tags_increase: ["urinary_sx","fever"], tags_decrease: ["guarding","rif_pain"] },
    "Renal calculi":            { tags_increase: ["sudden_onset","colicky","urinary_sx"], tags_decrease: ["diarrhea","guarding"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 9. HEADACHE
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "headache", name: "Headache", category: "Neuro", ageGroup: "all",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["thunderclap","worst ever","neck stiff","vomiting","papilledema","focal","seizure","morning worse","woke from sleep"],
  commonDifferentials: ["Tension headache","Migraine","Viral fever","Sinusitis","Meningitis","Raised ICP","Hypertension","Refractive error"],
  tags: ["headache","head pain","migraine","tension"],
  clinicalContent: `HEADACHE — CLINICAL REFERENCE | India OPD

RED FLAGS (SNNOOP10): Sudden thunderclap onset → SAH. Neurological deficit with headache. New onset elderly/immunocompromised. Onset with exertion/cough/Valsalva. Papilledema → raised ICP. Progressive worsening over days/weeks. Fever + headache + neck stiffness → meningitis. Morning headache waking from sleep → raised ICP. Postural component. New headache in child with cancer/HIV.

DIFFERENTIALS: 1. Tension-type — most common; bilateral, band-like, mild-moderate, no nausea. 2. Migraine — unilateral, pulsatile, moderate-severe; nausea, photo/phonophobia; 4-72 hours. 3. Viral fever headache — with fever, myalgia, resolves with fever. 4. Sinusitis — frontal/maxillary pressure, worsens bending, post-nasal drip. 5. Meningitis — fever + headache + neck stiffness triad. 6. Raised ICP — morning headache, worse lying, vomiting, papilledema. 7. Hypertensive headache — occipital, in hypertensive emergency. 8. Refractive error — frontal, worsens with screens/reading. 9. SAH — thunderclap "worst headache of life", EMERGENCY. 10. CVST — young women (OCP), postpartum, progressive.

INVESTIGATIONS: Urgent CT/MRI if: first/worst ever, thunderclap, neurological signs, papilledema, fever+meningismus. CBC, CRP if fever. LP after CT if meningitis/SAH suspected. BP monitoring. Vision and refraction test.

TREATMENT: Tension: paracetamol, ibuprofen, stress management. Migraine acute: ibuprofen/naproxen + antiemetic; triptans in adolescents. Migraine prophylaxis: propranolol or topiramate if >4/month. Sinusitis: decongestants, nasal saline; antibiotics only if bacterial. Refractive error: ophthalmology referral.`,
  workflow: {
    entryNode: "h1",
    nodes: [
      { id: "h1", question: "Did the headache come on suddenly and severely — like a 'thunderclap' or 'explosion'?", options: [
        { label: "Yes — sudden severe, 'worst headache of my life'", next: "h2", tags: ["thunderclap"], redFlag: true, redFlagMessage: "Thunderclap headache — subarachnoid hemorrhage until proven otherwise; EMERGENCY CT scan immediately" },
        { label: "Came on gradually over hours", next: "h2", tags: ["gradual"] },
        { label: "Recurring pattern, had this before", next: "h3", tags: ["recurrent"] },
        { label: "Mild headache, gradual onset", next: "h3", tags: ["mild"] },
      ]},
      { id: "h2", question: "Is there fever AND neck stiffness (cannot touch chin to chest)?", options: [
        { label: "Yes — fever + cannot bend neck", next: "h3", tags: ["meningismus","fever"], redFlag: true, redFlagMessage: "Headache + fever + neck stiffness — meningitis must be excluded; CT then LP urgently" },
        { label: "Fever only, no neck stiffness", next: "h3", tags: ["fever_only"] },
        { label: "No fever or neck stiffness", next: "h3", tags: [] },
      ]},
      { id: "h3", question: "Where is the headache located and what does it feel like?", options: [
        { label: "One side, throbbing / pulsatile", next: "h4", tags: ["unilateral","throbbing","migraine"] },
        { label: "Both sides, tight band around head", next: "h4", tags: ["bilateral","tension"] },
        { label: "Frontal / behind eyes, pressure, worsens bending forward", next: "h4", tags: ["frontal","sinusitis"] },
        { label: "Back of head, worse in mornings or lying down", next: "h4", tags: ["occipital","morning_worse"], redFlag: true, redFlagMessage: "Morning headache progressively worsening — raised ICP must be excluded; fundoscopy and imaging" },
      ]},
      { id: "h4", question: "Any nausea, vomiting, or sensitivity to light or noise?", options: [
        { label: "Yes — nausea + light/noise sensitivity", next: "h5", tags: ["migraine_features","nausea"] },
        { label: "Vomiting without nausea (projectile)", next: "h5", tags: ["projectile_vomiting"], redFlag: true, redFlagMessage: "Projectile vomiting with headache — raised ICP; check fundoscopy for papilledema" },
        { label: "Nausea only", next: "h5", tags: ["nausea"] },
        { label: "No nausea or sensitivity", next: "h5", tags: [] },
      ]},
      { id: "h5", question: "Any visual changes — blurring, double vision, or bright zigzag lines before the headache?", options: [
        { label: "Yes — zigzag lines or visual aura before headache", next: "h6", tags: ["aura","migraine"] },
        { label: "Blurring of vision", next: "h6", tags: ["blurred_vision"] },
        { label: "Double vision", next: "h6", tags: ["diplopia"], redFlag: true, redFlagMessage: "Diplopia with headache — 3rd nerve palsy or raised ICP; urgent imaging" },
        { label: "No visual changes", next: "h6", tags: [] },
      ]},
      { id: "h6", question: "Is the headache worst in the morning and does it wake the child from sleep?", options: [
        { label: "Yes — consistently worst in the morning or wakes from sleep", next: "h7", tags: ["morning_headache"], redFlag: true, redFlagMessage: "Morning or nocturnal headache — raised ICP pattern; urgent MRI brain" },
        { label: "No particular time pattern", next: "h7", tags: [] },
        { label: "Evening or end-of-day headache", next: "h7", tags: ["evening"] },
      ]},
      { id: "h7", question: "Does the headache worsen with extended screen use or reading?", options: [
        { label: "Yes — much worse with screens or reading", next: "h8", tags: ["eye_strain","refractive"] },
        { label: "No relationship with screen use", next: "h8", tags: [] },
        { label: "Unsure", next: "h8", tags: [] },
      ]},
      { id: "h8", question: "Is there a family history of migraines?", options: [
        { label: "Yes — parent or sibling has migraines", next: "h9", tags: ["family_migraine"] },
        { label: "No family history of migraine", next: "h9", tags: [] },
        { label: "Unsure", next: "h9", tags: [] },
      ]},
      { id: "h9", question: "How many headaches per month, and how long does each last?", options: [
        { label: "4 or more per month, each lasting hours", next: "h_handoff", tags: ["frequent_migraine"] },
        { label: "1–3 per month", next: "h_handoff", tags: ["episodic"] },
        { label: "Daily / almost daily", next: "h_handoff", tags: ["chronic_daily"], redFlag: true, redFlagMessage: "Chronic daily headache — consider medication overuse headache; review analgesic use" },
        { label: "This is a one-off or unusual episode", next: "h_handoff", tags: ["acute_single"] },
      ]},
      { id: "h_handoff", question: "History complete. Would you like AI to analyse this headache history and suggest a diagnosis with management?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Migraine":          { tags_increase: ["unilateral","throbbing","migraine","migraine_features","aura","family_migraine","recurrent","nausea"], tags_decrease: ["fever","meningismus","thunderclap"] },
    "Tension headache":  { tags_increase: ["bilateral","tension","mild","eye_strain","episodic","evening"], tags_decrease: ["thunderclap","meningismus","morning_headache"] },
    "Meningitis":        { tags_increase: ["meningismus","fever","fever_only"], tags_decrease: ["recurrent","aura"] },
    "Sinusitis":         { tags_increase: ["frontal","sinusitis","fever_only"], tags_decrease: ["unilateral","morning_headache"] },
    "Raised ICP":        { tags_increase: ["morning_headache","morning_worse","projectile_vomiting","diplopia","blurred_vision"], tags_decrease: ["recurrent","aura"] },
    "Refractive error":  { tags_increase: ["refractive","eye_strain","frontal","bilateral"], tags_decrease: ["morning_headache","meningismus"] },
    "Viral fever":       { tags_increase: ["fever_only"], tags_decrease: ["recurrent","aura"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

// ═══════════════════════════════════════════════════════════════════════════
// 10. NEONATAL JAUNDICE
// ═══════════════════════════════════════════════════════════════════════════
{
  id: "neonatal_jaundice", name: "Baby Looks Yellow (Newborn)", category: "Newborn", ageGroup: "neonatal",
  source: "system", author: "ClinicalMind", version: 1,
  redFlagKeywords: ["day 1","direct","pale stool","dark urine","kernicterus","seizure","lethargic","not feeding","Rh"],
  commonDifferentials: ["Physiological jaundice","ABO incompatibility","Rh incompatibility","G6PD deficiency","Neonatal sepsis","Biliary atresia","Breast milk jaundice","Breastfeeding failure jaundice","Hypothyroidism"],
  tags: ["jaundice","neonate","newborn","bilirubin","yellow"],
  clinicalContent: `NEONATAL JAUNDICE — CLINICAL REFERENCE | India OPD/Nursery

PHYSIOLOGICAL vs PATHOLOGICAL: Physiological: appears day 2-3, peaks day 4-5 (term) or day 5-7 (preterm), resolves by day 10-14 (term) or 3 weeks (preterm). Indirect (unconjugated) bilirubin. Pathological: appears <24h, rises rapidly (>5mg/dL/day), persists >2w (term), or is direct/conjugated.

RED FLAGS: Jaundice in first 24h → ALWAYS pathological; likely hemolytic disease. Bilirubin encephalopathy: lethargy, hypotonia, high-pitched cry, arching (opisthotonus), seizures. Pale/acholic stools + dark urine → conjugated hyperbilirubinemia/biliary atresia — refer BEFORE 6 weeks. Sick baby: fever, poor feeding, abdominal distension → sepsis. Rapidly rising bilirubin >0.5mg/dL/hour.

DIFFERENTIALS: 1. Physiological jaundice — day 2-5, indirect, no hemolysis, feeding well. 2. ABO incompatibility — mother O, baby A or B; DAT positive; appears day 1-2. 3. Rh incompatibility — Rh-ve mother, Rh+ve baby; can be severe. 4. G6PD deficiency — hemolysis with drugs/infection/naphthalene; common in India. 5. Neonatal sepsis — sick baby, fever or hypothermia, lethargy. 6. Breast milk jaundice — prolonged beyond 2w, otherwise healthy. 7. Breastfeeding failure jaundice — early, inadequate intake, weight loss. 8. Biliary atresia — direct hyperbilirubinemia, pale stools, dark urine; KASAI BEFORE 8 WEEKS. 9. Hypothyroidism — prolonged jaundice; check TFT. 10. Polycythemia — high RBC breakdown.

INVESTIGATIONS: Total and direct bilirubin. Blood group (mother and baby) + DAT. CBC + peripheral smear. Reticulocyte count. G6PD enzyme assay. Blood culture + sepsis workup if unwell. TFT if jaundice >2w. LFT + GGT if direct hyperbilirubinemia. Hepatobiliary ultrasound (absent gallbladder = biliary atresia).

TREATMENT: Phototherapy: first-line for indirect hyperbilirubinemia. Exchange transfusion: rapidly rising despite phototherapy or encephalopathy. Biliary atresia: Kasai portoenterostomy — refer urgently before 8 weeks. G6PD: avoid offending drugs. Sepsis: IV antibiotics per neonatal protocol.`,
  workflow: {
    entryNode: "nj1",
    nodes: [
      { id: "nj1", question: "When did the jaundice first appear?", options: [
        { label: "Within first 24 hours of birth", next: "nj2", tags: ["day1_jaundice"], redFlag: true, redFlagMessage: "Jaundice in first 24h is ALWAYS pathological — likely hemolytic disease; urgent bilirubin + blood group" },
        { label: "Day 2–3 (first few days)", next: "nj2", tags: ["day2_3"] },
        { label: "Day 4–5 (normal peak period)", next: "nj3", tags: ["day4_5","physiological"] },
        { label: "Still jaundiced beyond 2 weeks", next: "nj4", tags: ["prolonged_jaundice"], redFlag: true, redFlagMessage: "Prolonged jaundice (>2 weeks) — check direct bilirubin; rule out biliary atresia before 6 weeks" },
      ]},
      { id: "nj2", question: "What are the blood groups of mother and baby?", options: [
        { label: "Mother O — Baby A or B", next: "nj3", tags: ["abo_incompatibility"] },
        { label: "Mother Rh-negative — Baby Rh-positive", next: "nj3", tags: ["rh_incompatibility"], redFlag: true, redFlagMessage: "Rh incompatibility — can cause severe hemolysis; do DAT and serial bilirubin monitoring" },
        { label: "Compatible blood groups", next: "nj3", tags: [] },
        { label: "Not yet checked / unsure", next: "nj3", tags: [] },
      ]},
      { id: "nj3", question: "Is the baby feeding well and behaving normally?", options: [
        { label: "Yes — feeding well, active, gaining weight", next: "nj4", tags: ["well_baby","physiological"] },
        { label: "Poor feeding, lethargic, drowsy", next: "nj4", tags: ["sick_baby"], redFlag: true, redFlagMessage: "Lethargic baby with jaundice — rule out sepsis and bilirubin encephalopathy; urgent evaluation" },
        { label: "Breastfeeding — but seems to be getting too little milk", next: "nj4", tags: ["bf_failure"] },
        { label: "Breastfed well but jaundice persisting", next: "nj4", tags: ["breast_milk_jaundice"] },
      ]},
      { id: "nj4", question: "What colour are the baby's stools?", options: [
        { label: "Normal yellow or green (mustard colour)", next: "nj5", tags: ["normal_stool"] },
        { label: "Pale, chalky, white or clay-coloured", next: "nj5", tags: ["pale_stool"], redFlag: true, redFlagMessage: "Pale stools = conjugated jaundice — suspect biliary atresia; URGENT hepatology referral before 6 weeks" },
        { label: "Dark urine noticed on the nappy", next: "nj5", tags: ["dark_urine","conjugated"], redFlag: true, redFlagMessage: "Dark urine in neonatal jaundice = conjugated bilirubin — urgent hepatology referral" },
        { label: "Unsure / not checked", next: "nj5", tags: [] },
      ]},
      { id: "nj5", question: "Is there any family history of G6PD deficiency, jaundice in siblings, or previous blood transfusion in a sibling?", options: [
        { label: "Yes — G6PD in family or jaundiced sibling", next: "nj6", tags: ["g6pd_risk","family_jaundice"] },
        { label: "Previous sibling needed exchange transfusion", next: "nj6", tags: ["rh_sensitized"], redFlag: true, redFlagMessage: "Previous sibling needed exchange transfusion — Rh sensitisation likely; monitor bilirubin closely" },
        { label: "No family history", next: "nj6", tags: [] },
        { label: "Unsure", next: "nj6", tags: [] },
      ]},
      { id: "nj6", question: "What is the gestational age — was the baby premature?", options: [
        { label: "Full term (37+ weeks)", next: "nj7", tags: ["term"] },
        { label: "Late preterm (34–36 weeks)", next: "nj7", tags: ["late_preterm"], redFlag: true, redFlagMessage: "Late preterm infant — higher risk of severe jaundice; lower phototherapy threshold applies" },
        { label: "Preterm (< 34 weeks)", next: "nj7", tags: ["preterm"], redFlag: true, redFlagMessage: "Preterm infant with jaundice — start phototherapy earlier than term thresholds; admit" },
        { label: "Unsure", next: "nj7", tags: [] },
      ]},
      { id: "nj7", question: "Any high-pitched cry, arching of the back, or seizures in the baby?", options: [
        { label: "Yes — high-pitched cry or arching (opisthotonus)", next: "nj8", tags: ["encephalopathy"], redFlag: true, redFlagMessage: "Bilirubin encephalopathy (kernicterus) — EMERGENCY; exchange transfusion immediately" },
        { label: "Yes — seizures in the baby", next: "nj8", tags: ["seizures"], redFlag: true, redFlagMessage: "Seizures with jaundice — kernicterus or sepsis; emergency management" },
        { label: "No — baby looks comfortable", next: "nj8", tags: [] },
      ]},
      { id: "nj8", question: "Was the birth complicated — traumatic delivery, cephalohematoma, or bruising?", options: [
        { label: "Yes — large bruise on head (cephalohematoma) or traumatic delivery", next: "nj_handoff", tags: ["cephalohematoma"] },
        { label: "Normal birth, no trauma", next: "nj_handoff", tags: [] },
        { label: "C-section or assisted delivery without bruising", next: "nj_handoff", tags: [] },
        { label: "Unsure", next: "nj_handoff", tags: [] },
      ]},
      { id: "nj_handoff", question: "History complete. Would you like AI to review this neonatal jaundice case and advise on management?", options: [
        { label: "Yes — get AI clinical assessment", next: "AI", tags: ["ai_requested"] },
        { label: "No — generate note with current findings", next: "END", tags: [] },
      ]},
    ]
  },
  diffWeights: {
    "Physiological jaundice":       { tags_increase: ["day4_5","physiological","well_baby","normal_stool","term"], tags_decrease: ["day1_jaundice","pale_stool","sick_baby"] },
    "ABO incompatibility":          { tags_increase: ["abo_incompatibility","day2_3","day1_jaundice"], tags_decrease: ["well_baby"] },
    "Rh incompatibility":           { tags_increase: ["rh_incompatibility","rh_sensitized","day1_jaundice"], tags_decrease: ["well_baby"] },
    "G6PD deficiency":              { tags_increase: ["g6pd_risk","family_jaundice","day2_3"], tags_decrease: ["pale_stool"] },
    "Neonatal sepsis":              { tags_increase: ["sick_baby"], tags_decrease: ["well_baby","physiological"] },
    "Biliary atresia":              { tags_increase: ["pale_stool","dark_urine","prolonged_jaundice","conjugated"], tags_decrease: ["physiological","day1_jaundice"] },
    "Breast milk jaundice":         { tags_increase: ["prolonged_jaundice","breast_milk_jaundice","well_baby","normal_stool","term"], tags_decrease: ["day1_jaundice","pale_stool"] },
    "Breastfeeding failure jaundice":{ tags_increase: ["bf_failure","day2_3","day4_5"], tags_decrease: ["prolonged_jaundice","pale_stool"] },
    "Hypothyroidism":               { tags_increase: ["prolonged_jaundice","well_baby"], tags_decrease: ["day1_jaundice","sick_baby"] },
  },
  createdAt: new Date().toISOString(), editedAt: new Date().toISOString()
},

];

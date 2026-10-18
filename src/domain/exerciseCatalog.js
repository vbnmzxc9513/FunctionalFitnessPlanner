import catalog from '../data/badmintonExercises.json' with { type: 'json' };

export const EXERCISE_CATEGORIES = ['warmup', 'lower', 'upper', 'core', 'power', 'footwork', 'reaction', 'recovery', 'conditioning'];
export const EQUIPMENT = ['dumbbell', 'band', 'cable', 'jump_rope', 'foam_roller', 'platform', 'racket', 'shuttlecock', 'ball', 'screen', 'pullup_bar'];

const EN_TIPS = {
  A01: 'Start with easy steps; add controlled side steps and gradually increase pace.',
  A02: 'Keep the heel down and move the knee forward in line with the toes.',
  A03: 'Send the hips back while keeping the trunk steady; stand using the hips.',
  A04: 'Use a comfortable step and reach without arching the lower back.',
  A05: 'Sit into one hip with a stable foot, then shift smoothly to the other side.',
  A06: 'Keep the knees together and rotate the chest gently without forcing the lower back.',
  A07: 'Keep elbows nearly straight and let the shoulder blades move; do not sag at the waist.',
  A08: 'Use light resistance and a small controlled rotation; progress swings gradually.',
  A09: 'Slide the arms through a comfortable range without flaring ribs or forcing wrists onto the wall.',
  A10: 'Move slowly between gentle spinal flexion and extension; avoid forcing the neck or lower back.',
  A11: 'Rotate the chest while keeping the pelvis steady; do not pull on the head.',
  A12: 'Raise body temperature first, then follow all eight gentle parts. Mark the whole flow once, after finishing. Save longer static holds for cooldown.',
  A13: 'Walk or march for 2 minutes first, then follow the eight-part, 10-minute full-body dynamic flow. Use comfortable ranges without bouncing or pain; hold to see all steps. Mark once after finishing.',
  B01: 'Lower with a stable front foot and knee aligned with the toes; use bodyweight first.',
  B02: 'Sit into the stepping hip, brake under control, then push back to the start.',
  B03: 'Secure the band under the feet, hinge at the hips and stand without arching the back.',
  B04: 'Face away from the low pulley; move through the hips while controlling the rope return.',
  B05: 'Use support, soften the standing knee and keep the pelvis facing the floor.',
  B06: 'Raise the hips without arching the lower back; breathe normally.',
  B07: 'Raise and lower the heels smoothly without bouncing; use support if needed.',
  B08: 'Maintain a slightly bent knee while raising and lowering the heels.',
  B09: 'Take small side steps with a steady pelvis and knees aligned with the feet.',
  B10: 'Hold the dumbbell close to the chest and squat only as deep as you can control.',
  B11: 'Keep dumbbells close to the legs, push the hips back and stop before the back position changes.',
  B12: 'Use a low stable rear-foot support and load the front leg; master a floor split squat first.',
  C01: 'Pull the elbow back with a steady trunk; do not twist to move the load.',
  C02: 'Press without shrugging or flaring the ribs; hold the handle throughout the return.',
  C03: 'Keep the body aligned and elbows comfortably angled back; regress to a wall or incline.',
  C04: 'Pull in front of the chest with controlled shoulders; avoid behind-the-neck pulldowns.',
  C05: 'Keep the elbow near the side and rotate the forearm without turning the trunk.',
  C06: 'Use light resistance and pull beside the face without shrugging or arching the back.',
  C07: 'Reach slightly forward through the shoulder blade while keeping the trunk steady.',
  C08: 'Support the forearm and move the wrist slowly through a comfortable range.',
  C09: 'Keep the elbow near the body and turn the forearm rather than rotating the whole shoulder.',
  C10: 'Use stable support and pull the elbow toward the hip without swinging or twisting.',
  C11: 'Set up safely, lower until the upper arms lightly meet the floor, then press under control.',
  D01: 'Exhale and extend only as far as you can keep the trunk controlled.',
  D02: 'Face sideways to the anchor and press forward without letting the trunk rotate.',
  D03: 'Stack the shoulder above the elbow and keep the hips lifted while breathing.',
  D04: 'Reach long rather than high; keep the pelvis steady.',
  D05: 'Let feet, hips and chest turn together; keep hold of the handle and control the return.',
  D06: 'Move diagonally toward the opposite hip with controlled hip rotation, not a whipping arm.',
  D07: 'Lift toward opposite chest height without shrugging or arching the lower back.',
  D08: 'Walk slowly without leaning to either side; turn carefully and breathe.',
  D09: 'Rest feet on the wall with hips and knees near 90 degrees; breathe gently without forcing pelvic tilt.',
  E01: 'Drop into a small squat and hold stable alignment; no jump is needed.',
  E02: 'Use a low jump, land quietly and hold for two seconds before resetting.',
  E03: 'Start with a short lateral bound and hold the landing before progressing.',
  E04: 'Use small quiet two-foot hops; regress to calf raises if ankles or knees are uncomfortable.',
  E05: 'Turn the hips and feet, use a low jump and regain balance before returning.',
  E06: 'Keep the free knee at a comfortable height and use small lateral hops; stop if alignment deteriorates.',
  E07: 'Start low, land on the same leg and hold steady; do not chase maximum height initially.',
  E08: 'Use short forward-back hops in one plane before adding diagonal directions.',
  E09: 'Hop a short distance on one leg and hold the landing for two seconds.',
  E10: 'Master hop-and-stick first; keep repeated hops short and stop when control declines.',
  F01: 'Time the small landing near the opponent’s contact, then push into the first step.',
  F02: 'Brake through the hip and knee, then push back to the base position.',
  F03: 'Decelerate over the final steps instead of slamming one locked leg into the floor.',
  F04: 'Turn and see the route before moving back; avoid blind backward sprinting.',
  F05: 'Visit one corner per trial, then return and reset; preserve step sequence and balance.',
  F06: 'Brake before the marker, turn under control, then accelerate again.',
  G01: 'Mirror controlled partner movements with enough space; swap roles.',
  G02: 'Use two possible directions, read the cue and move without guessing early.',
  G03: 'Allow a bounce and catch within reach; do not dive or lunge recklessly.',
  G04: 'Use gentle tosses on stable ground and keep the support knee softly bent.',
  G05: 'Take a controlled step, catch within reach, then return to the start.',
  G06: 'Read a gentle underarm feed, move to the shuttle and reset after each return.',
  G07: 'Pause near racket contact, predict the direction, then play and check the answer.',
  G08: 'Start with two feed zones and prioritize cue timing and feeding quality.',
  H01: 'Keep the rear heel down and knee nearly straight; use a mild stretch.',
  H02: 'Keep the rear heel down with a softly bent knee; move gently forward.',
  H03: 'Gently tighten the glute and move forward without arching the lower back.',
  H04: 'Move through the hip without forcing the crossed knee.',
  H05: 'Hinge forward with a slightly soft knee instead of rounding to reach the toes.',
  H06: 'Shift gently into one hip with stable feet; do not force depth.',
  H07: 'Use a comfortable arm angle and a small forward movement; avoid pressure at the front of the shoulder.',
  H08: 'Gently guide the palm without forcefully bending fingers.',
  H09: 'Share bodyweight with arms and the other leg; avoid joints, bones and sharp pain.',
  H10: 'Roll the calf muscles gently, avoiding the back of the knee and Achilles tendon.',
  H11: 'Support bodyweight and roll one glute gently; avoid the spine, bony points and tingling.',
  H12: 'Support the head and extend the upper back slightly; do not press the roller into the neck or lower back.',
  I01: 'Use a pace that allows full sentences; start with shorter walks on tired weeks.',
  I02: 'Use moderate repeatable footwork and stop when the step pattern deteriorates.',
  I03: 'Set the feeding rate to preserve technique; do not maximize speed, reach and ball count together.',
  I04: 'Use low quiet jumps and start on a separate day from extra plyometrics.',
};

export function catalogExercises(lang = 'zh') {
  return Object.fromEntries(catalog.map(exercise => [exercise.id, {
    ...exercise,
    name: lang === 'en' ? exercise.nameEn : exercise.name,
    tip: lang === 'en' ? EN_TIPS[exercise.catalogCode] : exercise.cue,
    aliases: [exercise.name, exercise.nameEn, ...(exercise.aliases || []), ...(exercise.catalogCode === 'B12' ? ['保佳利亞蹲'] : [])],
  }]));
}

// A timed sequence includes every part and both sides. It cannot be compressed
// into a few reps by a generated/shared prescription while showing the full guide.
export function validSequenceDose(id, dose) {
  const minutes = catalog.find(exercise => exercise.id === id)?.sequenceMinutes;
  return !minutes || dose.sets === 1 && dose.value === String(minutes) && dose.unit === 'minutes'
    && dose.perSide === false && dose.restSeconds === 0 && !dose.preparation;
}

export function equipmentChoices(exercise, equipment = []) {
  return (exercise.equipmentOptions || []).filter(option => option.every(item => equipment.includes(item)));
}

export function eligibleExercises(exercises, context) {
  return Object.fromEntries(Object.entries(exercises).filter(([, exercise]) => {
    if (exercise.deleted || exercise.active === false) return false;
    if (exercise.advanced && context.experience === 'beginner') return false;
    if (exercise.requiresPartner && !context.partnerAvailable) return false;
    if (context.healthStatus !== 'unrestricted' && exercise.shoulderLoaded) return false;
    if (exercise.equipmentOptions && !equipmentChoices(exercise, context.equipment).length) return false;
    // Custom exercises without metadata remain available for ordinary planning, but
    // uncertain clinical restrictions must not silently allow unclassified loading.
    if (context.healthStatus !== 'unrestricted' && !exercise.catalogCode) return false;
    return true;
  }).map(([id, exercise]) => [id, {
    ...exercise,
    equipmentOptions: context.healthStatus !== 'unrestricted'
      ? equipmentChoices(exercise, context.equipment).filter(option => !option.some(item => ['dumbbell', 'cable', 'band', 'racket'].includes(item)))
      : exercise.equipmentOptions,
  }]).filter(([, exercise]) => !exercise.equipmentOptions || exercise.equipmentOptions.length));
}

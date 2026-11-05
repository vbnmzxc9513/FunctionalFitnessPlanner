// References from the user's Canva movement grid. These identify the source;
// app instructions describe our controlled gym adaptation, not a video transcript.
export const CANVA_MOVEMENT_SOURCE = 'https://www.canva.com/design/DAHY_eELi54/FMCNn6c0wehjEGDqgM3_Iw/view';
export const EXERCISE_SOURCES = {
  bf_C14: { title: '單臂下拉', videoId: '50y3Ba7EKaQ' },
  shoulder_press: { title: '站姿肩推', videoId: 'wWRWRvNHSyw' },
  plank_row: { title: '俯撐划船', videoId: 'Vl-_Zp_JuyA' },
  weighted_lunge: { title: '負重跨步', videoId: 'yoQp5ni1_Mo' },
  bf_C04: { title: '高位下拉', videoId: 'V4uXTNsB9So' },
  bf_C01: { title: '水平划船', videoId: 'y9H9-JkLSWE' },
  bf_B07: { title: '小腿提踵', videoId: 'tnMxBSUy1CM' },
  bf_D02: { title: '前推對抗', videoId: 'qz77ZPE4pqA' },
  bf_D05: { title: '滑輪轉體', videoId: 'NxEIbGbRJLg' },
};

export function getExerciseSource(id) {
  const source = Object.hasOwn(EXERCISE_SOURCES, id) ? EXERCISE_SOURCES[id] : null;
  return source ? { ...source, sourceUrl: CANVA_MOVEMENT_SOURCE, videoUrl: `https://www.youtube.com/shorts/${source.videoId}` } : null;
}

// Gemini request behavior is preserved; API changes are outside this repair.
export const generateAIPlan = async (lastWeekData, currentLevel, lastWeekFeedback, userApiKey, allProgress, metricsHistory, userGoal, dailyTime, userMessage, availableExercises, lang = 'zh', selectedModel = 'gemini-2.5-flash') => {
  if (!userApiKey) throw new Error("API_KEY_MISSING");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`;
  const completedCount = lastWeekData ? Object.values(lastWeekData).filter(Boolean).length : 0;

  let feedbackText = "無反饋紀錄";
  if (lastWeekFeedback === -1) feedbackText = "覺得太困難 (請考慮增加動態恢復、減少高衝擊動作)";
  if (lastWeekFeedback === 0) feedbackText = "覺得強度剛好 (請維持目前的主題與強度架構)";
  if (lastWeekFeedback === 1) feedbackText = "覺得太簡單 (請增加動作複雜度或替換為爆發力導向動作)";

  const metricsSummary = metricsHistory && metricsHistory.length > 0
    ? metricsHistory.map(m => `日期: ${m.date}, 體重: ${m.weight || '-'}kg, 體脂: ${m.bodyFat || '-'}%, 基礎代謝: ${m.bmr || '-'}kcal, 肌肉(左手/右手/左腳/右腳/軀幹): ${m.muscleLarm || '-'}/${m.muscleRarm || '-'}/${m.muscleLleg || '-'}/${m.muscleRleg || '-'}/${m.muscleTrunk || '-'}kg`).join('\n  ')
    : "無身體組成紀錄";

  const historySummary = Object.entries(allProgress || {})
    .filter(([weekId]) => weekId.includes('-W'))
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8)
    .map(([weekId, data]) => {
      const done = data.completed ? Object.values(data.completed).filter(Boolean).length : 0;
      let fb = "無反饋";
      if (data.feedbackValue === -1) fb = "太困難";
      if (data.feedbackValue === 0) fb = "剛好";
      if (data.feedbackValue === 1) fb = "太簡單";
      return `週次: ${weekId}, 完成數量: ${done}, 體感反饋: ${fb}`;
    }).join('\n  ') || "無歷史紀錄";

  const customPromptSection = userGoal && userGoal.trim() !== ''
    ? `\n  【使用者近期訓練目標】\n  ${userGoal.trim()}\n  (請以此目標為核心，挑選針對性動作，並在總結中詳細說明你如何利用這週課表幫助他達成。)`
    : '';

  const messageSection = userMessage && userMessage.trim() !== ''
    ? `\n  【使用者想對教練說的話】\n  ${userMessage.trim()}\n  (請在給予建議時，適當地回應這段話，展現教練的關心與專業。)`
    : '';

  const prompt = `
  你是一位專注於羽球專項的「專業功能性健身教練」。排表時請特別注重羽球所需的步伐敏捷、核心抗旋轉、肩關節穩定與爆發力。
  使用者每週預期運動 5 天，每天大約 ${dailyTime || 30} 分鐘。請根據此時間，合理評估每天應該安排的動作數量與各動作組數範圍。
  請綜合評估使用者的近期訓練目標、歷史身體數值趨勢與歷史運動紀錄，為本週（星期一到星期五）安排一份全新、最適合他當前狀態的課表，並向使用者說明「為何這樣安排」。

  【使用者上週狀態】
  - 上週完成動作數: ${completedCount}
  - 當前難度參數: ${currentLevel} (0=減壓, 1=建構, 2=高強度)
  - 上週體感反饋: ${feedbackText}

  【歷史身體數值趨勢】
  ${metricsSummary}

  【歷史運動紀錄】
  ${historySummary}
  ${customPromptSection}
  ${messageSection}

  【可用動作代碼與名稱】
  ${Object.entries(availableExercises).map(([k, v]) => `${k}: ${v.name} (${v.type})`).join('\n')}

   1. 給予一段客製化的教練總結建議。你「必須」在這段建議中包含以下要素，並且【強制使用 Markdown 語法進行排版】。請將長篇內容拆分為數個易於閱讀的段落，並為每個段落自創一個【符合該段落內容核心精神的動態標題】（例如：『### 🔥 體脂驟降！超群的核心成長』）。【⚠️排版警告：每個 ### 標題的前面與後面，都請「務必」加上「兩次換行 (Enter 兩次)」！絕對不要把標題跟普通內文黏在同一行，否則排版會完全損壞！】，【絕對不要】使用制式的死板標題（例如：忌用「專業診斷」、「推斷原因」、「課表對策」等）。整份評語必須像一封專業且熱情的教練信件，段落分層必須非常清晰：
      - 綜合診斷與具體讚美：解讀「歷史身體數值趨勢」與「完成度」，明確點出數據的變化，並客觀評估學員「目前狀態的優劣程度」。以專業角度解釋其變化原因。若發現學員有進步（如肌肉量上升、高完成度），在維持專業感的前提下【請不要吝嗇你的讚美】，給予強烈、熱情且有數據佐證的正向鼓勵。
      - 課表對策與目標對焦：針對觀察到的身體狀態與使用者的「近期訓練目標」，具體說明這週課表「為什麼這樣排」、「背後的訓練目的是什麼」，以及這些特定動作將如何幫助他解決當前問題，並在羽球場上達成他的目標。
  2. 安排星期一到星期五的課表，每天請絕對從【可用動作代碼與名稱】挑選剛好 4 到 5 個動作代碼。【⚠️極度重要警告：嚴格禁止使用任何不在上述清單內的動作代碼！即使是你認識的常見動作也絕對不可排入！】
  3. 每天的主題 (theme) 必須是明確的「羽球專項訓練目標」 (例如：單邊穩定與網前急停)。
  4. 每天的評語 (concept) 必須說明當天的訓練如何連結到「羽球的特定動作 (如躍起殺球、防守接殺、米字步)」，以及「背後的發力與穩定原理」。請分為【羽球連結】與【原理】兩部分撰寫，中間務必使用 \\n 換行。
  5. 每天的教練叮嚀 (coachAdvice) 必須是非常具體的「每日銜接建議」：綜合考量「昨天練了什麼/哪裡會痠痛」、「今天要注意什麼代償/該如何放鬆」，以及「明天預計要練什麼/所以今天該做什麼準備」。例如：『因為昨天做了大量下肢，今天大腿前側可能較痠，所以今天的核心訓練要注意不要用腿部代償；明天預計會練肩推，因此今天的最後請務必確實拉伸胸大肌。』
  ${lang === 'en' ? '\n  [IMPORTANT] The user interface is currently set to English. Please write ALL your responses (conclusion, schedule themes, concepts, and coachAdvice) in ENGLISH.' : ''}
  `;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          conclusion: { type: "STRING", description: "教練給予的建議，以及這週課表「為何這樣安排」的詳細原因與依據。" },
          schedule: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                day: { type: "INTEGER" },
                name: { type: "STRING" },
                theme: { type: "STRING" },
                concept: { type: "STRING" },
                coachAdvice: { type: "STRING" },
                routine: { type: "ARRAY", items: { type: "STRING" } }
              }
            }
          }
        }
      }
    }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "API Error");
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(resultText);
    } catch (e) {
      if (e.message === "API_KEY_MISSING" || attempt === 2) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
};

const VALID_EXERCISE_TYPES = ['mobility', 'lower', 'core', 'upper_pull', 'upper_push', 'full', 'power'];

export const generateExerciseDetails = async (exerciseName, userApiKey, selectedModel = 'gemini-2.5-flash') => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`;

  const prompt = `你是一位專業健身教練，負責將新動作加入羽球功能性健身訓練資料庫。

動作名稱：「${exerciseName}」

【任務一】判斷動作類型 (type)
從以下 7 個類別中選擇「最符合」的一個，並輸出其對應的英文代碼：
- mobility（活動度）：增加關節活動範圍、伸展或鬆動。例：胸椎旋轉、臀屈肌伸展
- lower（下肢肌力）：訓練腿部與臀部肌力。例：深蹲、硬舉、保加利亞分腿蹲
- core（核心穩定）：訓練軀幹抗旋轉、抗屈曲或核心耐力。例：棒式、死蟲、平板划船
- upper_pull（上肢拉）：訓練背肌、二頭等「拉」的動作。例：引體向上、啞鈴划船
- upper_push（上肢推）：訓練胸肌、三頭、肩等「推」的動作。例：伏地挺身、肩推、臥推
- full（全身複合）：同時涉及上下肢與核心。例：農夫行走、壺鈴擺盪、熊爬
- power（爆發力）：需快速發力或增強式動作。例：跳箱、深蹲跳、藥球拋擲

【任務二】撰寫教練提示 (tip)
- 長度：20 到 30 個中文字
- 說明此動作的關鍵發力感受或最重要的安全注意事項
- 語氣：專業、具體，避免籠統句子`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: VALID_EXERCISE_TYPES,
            description: "動作類型，只能從 7 種類別代碼中選一"
          },
          tip: {
            type: "STRING",
            description: "20到30字的中文教練提示"
          }
        },
        required: ["type", "tip"]
      }
    }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || "API Error");
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const result = JSON.parse(resultText);
      if (!VALID_EXERCISE_TYPES.includes(result.type)) result.type = 'full';
      if (!result.tip || result.tip.trim() === '') result.tip = '請專注於核心穩定，避免代償動作。';
      return result;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
};

export const checkAvailableModels = async (key) => {
    const defaultModels = [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!response.ok) return defaultModels;
      const data = await response.json();
      const validModels = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name.startsWith('models/gemini-'))
        .map(m => m.name.replace('models/', ''));

      // Remove duplicates and deprecated versions, and obscure preview/image models
      const options = validModels
        .filter(m =>
          !m.includes('vision') &&
          !m.includes('latest') &&
          !m.includes('image') &&
          !m.includes('tts') &&
          (!m.includes('preview') || m.includes('3.0') || m.includes('3.1'))
        )
        .sort((a, b) => b.localeCompare(a)) // Put newer versions first
        .map(m => {
          let label = m.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
          // Enhance label if it's an experimental or premium pro model
          if (m.includes('exp') || (m.includes('pro') && !m.includes('test'))) {
            label = label + ' 💎';
          }
          return { id: m, label: label };
        });

      return options.length > 0 ? options : defaultModels;
    } catch {
      return defaultModels;
    }
  };

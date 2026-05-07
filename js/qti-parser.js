// qti-parser.js — Global large random number + time-based entropy

class QTIParser {
  constructor(xmlString) {
    this.xml = new DOMParser().parseFromString(xmlString, "text/xml");
    this.introduction = "";
    this.questions = [];
    this.parse();
  }

  parse() {
    // Extract introduction from rubric
    const rubrics = this.xml.getElementsByTagName("rubric");
    if (rubrics.length > 0) {
      const mattext = rubrics[0].querySelector("mattext");
      if (mattext) {
        this.introduction = mattext.textContent.trim();
      }
    }

    // === GLOBAL SEED WITH TIME-BASED ENTROPY ===
    const cryptoRandom = crypto.getRandomValues ? 
                         crypto.getRandomValues(new Uint32Array(4)) : 
                         [Math.random()*4294967296|0, Math.random()*4294967296|0, 
                          Math.random()*4294967296|0, Math.random()*4294967296|0];

    let globalSeed = (BigInt(cryptoRandom[0]) << 96n) |
                     (BigInt(cryptoRandom[1]) << 64n) |
                     (BigInt(cryptoRandom[2]) << 32n) |
                     BigInt(cryptoRandom[3]);

    // Add time-based entropy to fight "stuck" browser state
    const timeEntropy = BigInt(Date.now()) ^ BigInt(Math.floor(Math.random() * 1000000000));
    globalSeed = globalSeed ^ timeEntropy;

    console.log(`[GLOBAL SEED] Initialized with time entropy`);

    const items = this.xml.getElementsByTagName("item");
    for (let item of items) {
      const ident = item.getAttribute("ident");
      const label = item.getAttribute("label") || ident.split('-').pop();

      const mattext = item.querySelector("presentation mattext");
      const questionText = mattext ? mattext.textContent.trim() : "";

      const responseLids = item.querySelectorAll("response_lid");
      const isMatching = responseLids.length > 1;

      let correctPairs = {};
      let responseGroups = [];

      responseLids.forEach(lid => {
        const respId = lid.getAttribute("ident");
        const cardinality = lid.getAttribute("rcardinality") || "Single";

        const groupChoices = [];
        const labels = lid.querySelectorAll("response_label");
        labels.forEach(lbl => {
          const choiceId = lbl.getAttribute("ident");
          const text = lbl.querySelector("mattext")?.textContent.trim() || "";
          groupChoices.push({ id: choiceId, text });
        });

        responseGroups.push({
          respId,
          cardinality,
          choices: groupChoices
        });

        // ── GLOBAL BLOCK-BASED SHUFFLE WITH TIME ENTROPY ─────────────────
        const render = lid.querySelector("render_choice");
        if (render?.getAttribute("shuffle") === "Yes" && groupChoices.length > 1) {
          console.log(`[SHUFFLE] ${ident} BEFORE:`, groupChoices.map(c => c.id).join(' → '));

          const n = groupChoices.length;
          let seed = globalSeed;

          for (let i = n - 1; i > 0; i--) {
            const block = Number(seed % 10000000000n);   // 10-digit block
            let j = block % (i + 1);

            // Update seed using LCG + mix in time entropy again
            seed = (seed * 6364136223846793005n + 1442695040888963407n) ^ timeEntropy;

            // Overflow handling
            if (j === i && n > 2) {
              seed = (seed * 6364136223846793005n + 1n) % (1n << 64n);
              j = Number(seed % BigInt(i + 1));
            }

            [groupChoices[i], groupChoices[j]] = [groupChoices[j], groupChoices[i]];
          }

          console.log(`[SHUFFLE] ${ident} AFTER :`, groupChoices.map(c => c.id).join(' → '));

          // Advance global seed for next question
          globalSeed = (globalSeed * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
        }
      });

      // ── Extract correct mapping (unchanged) ─────────────────────────────
      const respconditions = item.querySelectorAll("respcondition");
      respconditions.forEach(cond => {
        const ands = cond.querySelectorAll("and varequal");
        let pair = {};
        ands.forEach(v => {
          const resp = v.getAttribute("respident");
          const val = v.textContent.trim();
          if (resp && val) pair[resp] = val;
        });
        if (Object.keys(pair).length > 0) {
          if (cond.getAttribute("continue") !== "Yes" || !Object.keys(correctPairs).length) {
            correctPairs = pair;
          }
        }
      });

      if (isMatching) {
        this.questions.push({
          id: ident,
          label,
          text: questionText,
          type: "matching",
          groups: responseGroups,
          correct: correctPairs,
          feedback: {},
          isMultiple: false
        });
      } else {
        const choices = responseGroups[0]?.choices || [];
        let correctIds = [];

        const respconditionsNo = item.querySelectorAll("respcondition[continue='No']");
        respconditionsNo.forEach(cond => {
          const varequal = cond.querySelector("varequal");
          if (varequal) correctIds.push(varequal.textContent.trim());
          const ands = cond.querySelectorAll("and varequal");
          ands.forEach(v => correctIds.push(v.textContent.trim()));
        });
        correctIds = [...new Set(correctIds.filter(Boolean))];

        const feedback = {};
        const itemfeedbacks = item.getElementsByTagName("itemfeedback");

        for (let fb of itemfeedbacks) {
          const fbId = fb.getAttribute("ident");
          if (!fbId) continue;

          const fbText = fb.querySelector("mattext")?.textContent.trim() || "";

          if (fbId === "correct" || fbId.toLowerCase() === "right") {
            feedback.globalCorrect = fbText;
          } else if (fbId === "incorrect" || fbId.toLowerCase() === "wrong") {
            feedback.globalIncorrect = fbText;
          } else {
            feedback[fbId] = fbText;
          }
        }

        this.questions.push({
          id: ident,
          label,
          text: questionText,
          choices,
          correct: correctIds,
          feedback,
          isMultiple: responseGroups[0]?.cardinality === "Multiple"
        });
      }
    }
  }

  getIntroduction() {
    return this.introduction;
  }

  getAllQuestions() {
    return this.questions;
  }
}

window.QTIParser = QTIParser;

// ================================================
// quiz-engine.js - FULL FINAL VERSION
// ================================================

let quizState = null;
let timerInterval = null;

function showProgressBar() {
  $('#quizProgressWrapper').show();
}

function hideProgressBar() {
  $('#quizProgressWrapper').hide();
}

function startQuiz(fileName, isTraining = false) {
  if (quizState) quizState = null;

  fetch('questions/' + fileName)
    .then(r => {
      if (!r.ok) throw new Error('Failed to load: ' + fileName);
      return r.text();
    })
    .then(xml => {
      const parser = new QTIParser(xml);
      const introduction = parser.getIntroduction();
      let questions = parser.getAllQuestions();

      if (questions.length === 0) {
        $('#quizContainer').html('<div class="alert alert-danger">No questions found.</div>');
        return;
      }

      // Shuffle questions
      if (questions.length > 1) {
        for (let i = questions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [questions[i], questions[j]] = [questions[j], questions[i]];
        }
      }

      const minutes = parseInt(localStorage.getItem('quizTimeLimit')) || 60;

      quizState = {
        questions,
        introduction,
        currentIndex: 0,
        userAnswers: {},
        trainingMode: !!isTraining,
        timeLeft: minutes * 60,
        fileName: fileName,
        originalTime: minutes
      };

      startTimer();
      showProgressBar();
      renderProgressBar();

      if (introduction) {
        showIntroduction();
      } else {
        renderQuestion();
      }
    })
    .catch(err => {
      console.error(err);
      $('#quizContainer').html('<div class="alert alert-danger">Error loading quiz: ' + err.message + '</div>');
    });
}

function startTimer() {
  clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    quizState.timeLeft--;
    const min = Math.floor(quizState.timeLeft / 60);
    const sec = quizState.timeLeft % 60;
    $('#timer').text(`${min}:${sec < 10 ? '0' : ''}${sec}`);

    const $badge = $('#timer-badge');

    if (quizState.timeLeft <= 60) {                    // Last minute
      $badge.addClass('bg-danger');
      $badge.css('animation', 'pulse 800ms infinite');
    } 
    else if (quizState.timeLeft <= 300) {              // Last 5 minutes
      $badge.removeClass('bg-secondary').addClass('bg-danger');
    } 
    else if (quizState.timeLeft <= 600) {
      $badge.removeClass('bg-secondary bg-danger').addClass('bg-warning text-dark');
    }

    if (quizState.timeLeft <= 0) {
      clearInterval(timerInterval);
      finishQuiz();
    }
  }, 1000);
}

function renderQuestion() {
  if (!quizState) return;

  const { questions, currentIndex, userAnswers, trainingMode } = quizState;
  const q = questions[currentIndex];
  if (!q) return finishQuiz();

  const isMatching = q.type === "matching";
  const alreadyAnswered = trainingMode && userAnswers[q.id]?.submitted === true;

  let html = `
    <div class="card bg-dark text-white mb-4" id="quizCard">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5>Question ${currentIndex + 1} of ${questions.length}${q.label ? ` (${q.label})` : ''}</h5>
        <span class="badge bg-secondary" id="timer-badge">Time: <span id="timer">${Math.floor(quizState.timeLeft / 60)}:${quizState.timeLeft % 60 < 10 ? '0' : ''}${quizState.timeLeft % 60}</span></span>
      </div>
      <div class="card-body">
        <p class="lead">${q.text}</p>`;

  if (isMatching) {
    html += `<div class="row mt-3">`;
    q.groups.forEach(group => {
      html += `<div class="col-md-6 mb-3"><h6>${group.respId}</h6><div class="list-group">`;
      group.choices.forEach(choice => {
        const inputName = `match_${q.id}_${group.respId}`;
        const inputId = `${inputName}_${choice.id}`;
        const isChecked = userAnswers[q.id]?.map?.[group.respId] === choice.id;
        const disabled = alreadyAnswered || quizState.timeLeft <= 0 ? 'disabled' : '';

        html += `
          <div class="option-item ${isChecked ? 'selected' : ''}" data-input="${inputId}">
            <input type="radio" name="${inputName}" id="${inputId}" value="${choice.id}" 
                   ${isChecked ? 'checked' : ''} ${disabled} style="display:none;">
            ${choice.text}
          </div>`;
      });
      html += `</div></div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="list-group mt-3">`;
    q.choices.forEach(choice => {
      const inputType = q.isMultiple ? 'checkbox' : 'radio';
      const inputName = q.isMultiple ? `q_${q.id}[]` : `q_${q.id}`;
      const inputId   = `opt_${q.id}_${choice.id}`;
      const isChecked = userAnswers[q.id]?.selected?.includes(choice.id) || false;
      const disabled  = alreadyAnswered || quizState.timeLeft <= 0 ? 'disabled' : '';

      html += `
        <div class="option-item ${isChecked ? 'selected' : ''}" data-input="${inputId}">
          <input type="${inputType}" name="${inputName}" id="${inputId}" value="${choice.id}" 
                 ${isChecked ? 'checked' : ''} ${disabled} style="display:none;">
          ${choice.text}
        </div>`;
    });
    html += `</div>`;
  }

  html += `</div>`; // card-body

  let footerButtons = `<button class="btn btn-secondary" id="prev-question" ${currentIndex === 0 ? 'disabled' : ''}>Previous</button>`;

  if (trainingMode) {
    if (alreadyAnswered) {
      footerButtons += `<button class="btn btn-primary" id="next-question">Next</button>`;
    } else {
      footerButtons += `<button class="btn btn-primary" id="check-answer">Check Answer</button>`;
    }
  } else {
    const isLast = currentIndex + 1 === questions.length;
    footerButtons += isLast 
      ? `<button class="btn btn-primary" id="finish-quiz">Finish Attempt</button>`
      : `<button class="btn btn-primary" id="next-question">Next</button>`;
  }

  html += `<div class="card-footer d-flex justify-content-between">${footerButtons}</div></div>`;

  $('#quizContainer').html(html);

  renderProgressBar();

  // Option selection
  $('.option-item').on('click', function() {
    if (alreadyAnswered || quizState.timeLeft <= 0) return;

    const $item = $(this);
    const $input = $item.find('input');

    if ($input.attr('type') === 'radio') {
      const name = $input.attr('name');
      $(`input[name="${name}"]`).prop('checked', false);
      $(`.option-item input[name="${name}"]`).closest('.option-item').removeClass('selected');

      $item.addClass('selected');
      $input.prop('checked', true);
    } else {
      $item.toggleClass('selected');
      $input.prop('checked', $item.hasClass('selected'));
    }
    saveCurrentAnswer(q);
  });

  // === BUTTON HANDLERS - REBOUND EVERY TIME ===
  $('#quizContainer')
    .off('click', '#prev-question')
    .on('click', '#prev-question', () => {
      if (quizState.currentIndex > 0) {
        quizState.currentIndex--;
        renderQuestion();
      }
    })
    .off('click', '#next-question')
    .on('click', '#next-question', () => {
      if (quizState.currentIndex + 1 < quizState.questions.length) {
        quizState.currentIndex++;
        renderQuestion();
      }
    })
    .off('click', '#check-answer')
    .on('click', '#check-answer', () => {
      if (!quizState.trainingMode || quizState.timeLeft <= 0) return;

      const qCurrent = quizState.questions[quizState.currentIndex];
      let answerData = isMatching ? { map: {}, submitted: true } : { selected: [], submitted: true };

      if (isMatching) {
        qCurrent.groups.forEach(group => {
          const val = $(`input[name="match_${qCurrent.id}_${group.respId}"]:checked`).val();
          if (val) answerData.map[group.respId] = val;
        });
      } else {
        $(`input[name^="q_${qCurrent.id}"]:checked`).each(function() {
          answerData.selected.push($(this).val());
        });
      }

      quizState.userAnswers[qCurrent.id] = answerData;
      showFeedback(qCurrent, answerData);
      renderProgressBar();
    })
    .off('click', '#finish-quiz')
    .on('click', '#finish-quiz', finishQuiz);

  function saveCurrentAnswer(q) {
    if (isMatching) {
      const map = {};
      q.groups.forEach(group => {
        const val = $(`input[name="match_${q.id}_${group.respId}"]:checked`).val();
        if (val) map[group.respId] = val;
      });
      quizState.userAnswers[q.id] = { map, submitted: false };
    } else {
      const selected = [];
      $(`input[name^="q_${q.id}"]:checked`).each(function() {
        selected.push($(this).val());
      });
      quizState.userAnswers[q.id] = { selected, submitted: false };
    }
  }

  // Keyboard Shortcuts
  $(document).off('keydown.quiz').on('keydown.quiz', function(e) {
    if (quizState.timeLeft <= 0) return;

    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      const $opt = $('.option-item').eq(idx);
      if ($opt.length) {
        const $inp = $opt.find('input');
        if ($inp.attr('type') === 'radio') {
          const name = $inp.attr('name');
          $(`input[name="${name}"]`).prop('checked', false);
          $(`.option-item input[name="${name}"]`).closest('.option-item').removeClass('selected');
        }
        $opt.toggleClass('selected');
        $inp.prop('checked', $opt.hasClass('selected'));

        // $opt.addClass('selected');
        //$inp.prop('checked', true);
        saveCurrentAnswer(q);
      }
      return;
    }

    if (e.key.toLowerCase() === 'c' && $('#check-answer').length) $('#check-answer').trigger('click');
    if (e.key.toLowerCase() === 'n') {
      if ($('#next-after-feedback').length) $('#next-after-feedback').trigger('click');
      else if ($('#next-question').length) $('#next-question').trigger('click');
    }
    if (e.key.toLowerCase() === 'p' && $('#prev-question').length) $('#prev-question').trigger('click');
    if (e.key.toLowerCase() === 'f' && $('#finish-quiz').length) $('#finish-quiz').trigger('click');
  });

  // Touch Swipe
  let touchStartX = 0;
  const $card = $('#quizCard');

  $card.off('touchstart.quiz touchmove.quiz touchend.quiz')
    .on('touchstart.quiz', e => { touchStartX = e.changedTouches[0].screenX; })
    .on('touchend.quiz', e => {
      const diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) < 180) return;

      if (diff > 0) {
        if ($('#next-after-feedback').length) $('#next-after-feedback').trigger('click');
        else if ($('#next-question').length) $('#next-question').trigger('click');
        else if ($('#finish-quiz').length) {
          if (confirm("Finish the attempt now?")) finishQuiz();
        }
      } else {
        $('#prev-question').trigger('click');
      }
    });
    // ====================== AUTO SCROLL TO TOP ======================
    setTimeout(() => {
      window.scrollTo({
        top: $('#quizCard').offset().top - 90,
        behavior: 'smooth'
      });
    }, 100);
}

function showIntroduction() {
  if (!quizState || !quizState.introduction) {
    renderQuestion();
    return;
  }

  let html = `
    <div class="card bg-dark text-white mb-4">
      <div class="card-header">
        <h4>` + (i18next.t('introduction')) + `</h4>
      </div>
      <div class="card-body" style="max-height: 70vh; overflow-y: auto;">
        ${quizState.introduction}
      </div>
      <div class="card-footer text-end">
        <button class="btn btn-primary" id="start-questions-btn" aria-keyshortcuts="q">Start the Quiz →</button>
      </div>
    </div>`;

  $('#quizContainer').html(html);

  $('#start-questions-btn').on('click', () => renderQuestion());
}

function showFeedback(question, answerData) {
  $('#feedbackDiv').remove();

  let html = `<div class="alert alert-info mt-4" id="feedbackDiv"><h5>Feedback</h5>`;

  if (question.type === "matching") {
    html += `<p><strong>Your matching:</strong></p>`;
    question.groups.forEach(group => {
      const userVal = answerData.map?.[group.respId];
      const correctVal = question.correct?.[group.respId];
      const isCorrect = userVal === correctVal;
      const userText = group.choices.find(c => c.id === userVal)?.text || '—';
      const correctText = group.choices.find(c => c.id === correctVal)?.text || '—';

      html += `
        <div class="border rounded p-3 mb-3 ${isCorrect ? 'border-success bg-success bg-opacity-10' : 'border-danger bg-danger bg-opacity-10'}">
          <strong>${group.respId}:</strong> ${userText}
          <span class="float-end">${isCorrect ? '✔ Correct' : `✘ (correct: ${correctText})`}</span>
        </div>`;
    });
  } else {
    // === Single / Multiple Choice ===
    const selected = answerData.selected || [];
    const correct = question.correct || [];

    question.choices.forEach(choice => {
      const wasSelected = selected.includes(choice.id);
      const isCorrectChoice = correct.includes(choice.id);

      let boxClass = '';
      let icon = '';
      let label = '';

      if (isCorrectChoice && wasSelected) {
        boxClass = 'border-success bg-success bg-opacity-10';
        icon = '✔';
        label = '<span class="text-success fw-bold">Correct</span>';
      } 
      else if (isCorrectChoice && !wasSelected) {
        boxClass = 'border-warning bg-warning bg-opacity-10';
        icon = '✔';
        label = '<span class="text-warning fw-bold">Correct (missed)</span>';
      } 
      else if (!isCorrectChoice && wasSelected) {
        boxClass = 'border-danger bg-danger bg-opacity-10';
        icon = '✘';
        label = '<span class="text-danger fw-bold">Incorrect</span>';
      } 
      else {
        boxClass = 'border-secondary';
        icon = '';
        label = '';
      }

      html += `
        <div class="border rounded p-3 mb-3 ${boxClass}">
          <div class="d-flex justify-content-between align-items-start">
            <div><strong>${icon} ${choice.text}</strong></div>
            <div>${label}</div>
          </div>`;

      if (question.feedback?.[choice.id]) {
        html += `<div class="mt-2 small text-muted border-start border-2 border-info ps-2">${question.feedback[choice.id]}</div>`;
      }

      html += `</div>`;
    });
  }

  html += `
      <hr>
      <div class="d-flex justify-content-end">
        <button class="btn btn-primary" id="next-after-feedback">Next Question</button>
      </div>
    </div>`;

  $('#quizContainer').append(html);

  $('#next-after-feedback').on('click', () => {
    $('#feedbackDiv').remove();
    if (quizState.currentIndex + 1 < quizState.questions.length) {
      quizState.currentIndex++;
      renderQuestion();
    } else {
      finishQuiz();
    }
  });
}

function resetQuiz() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;

  if (quizState) {
    const currentFile = quizState.fileName;
    const currentTraining = quizState.trainingMode;

    quizState = {
      questions: quizState.questions,
      introduction: quizState.introduction,
      currentIndex: 0,
      userAnswers: {},
      trainingMode: currentTraining,
      timeLeft: quizState.originalTime * 60,
      fileName: currentFile,
      originalTime: quizState.originalTime
    };

    startTimer();
    renderQuestion();
  } else {
    $('#quizContainer').empty();
    $('#questionProgress').empty();
    hideProgressBar();
  }
}

function renderProgressBar() {
  if (!quizState) return;

  const total = quizState.questions.length;
  let html = '';

  quizState.questions.forEach((q, i) => {
    const answered = !!quizState.userAnswers[q.id]?.submitted;
    let cls = 'bg-secondary';

    if (i === quizState.currentIndex) cls = 'bg-primary';
    else if (answered) cls = 'bg-info';

    html += `<div class="progress-bar ${cls}" style="width: ${100/total}%;" data-index="${i}" title="Question ${i+1}"></div>`;
  });

  $('#questionProgress').html(html);

  $('#questionProgress .progress-bar').off('click').on('click', function() {
    quizState.currentIndex = parseInt($(this).data('index'));
    renderQuestion();
  });
}

function launchConfetti() {
  const count = 150;
  const defaults = {
    origin: { y: 0.7 }
  };

  function fire(particleRatio, opts) {
    confetti(Object.assign({}, defaults, opts, {
      particleCount: Math.floor(count * particleRatio),
      colors: ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1']
    }));
  }

  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2,  { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91 });
  fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92 });
  fire(0.1,  { spread: 120, startVelocity: 45 });
}

function finishQuiz() {
  if (!quizState) return;
  if (timerInterval) clearInterval(timerInterval);

  let correctCount = 0;

  quizState.questions.forEach(q => {
    const ans = quizState.userAnswers[q.id];
    if (!ans) return;

    let isCorrect = false;
    if (q.type === "matching") {
      isCorrect = JSON.stringify(ans.map || {}) === JSON.stringify(q.correct || {});
    } else {
      const selected = ans.selected || [];
      const correct = q.correct || [];
      isCorrect = correct.length > 0 && 
                  correct.every(c => selected.includes(c)) && 
                  selected.every(s => correct.includes(s));
    }
    if (isCorrect) correctCount++;
  });

  if (typeof saveAttempt === 'function') {
    saveAttempt(correctCount, quizState.questions.length, quizState.trainingMode, quizState.fileName);
  }

  // Confetti for perfect score
  if (correctCount === quizState.questions.length && correctCount > 0) {
    launchConfetti();
  }

  showDetailedResults(); // This already shows the score
}

function showDetailedResults() {
  if (!quizState) return;

  let correctCount = 0;

  // Calculate total correct
  quizState.questions.forEach(q => {
    const ans = quizState.userAnswers[q.id];
    if (!ans) return;

    let isCorrect = false;
    if (q.type === "matching") {
      isCorrect = JSON.stringify(ans.map || {}) === JSON.stringify(q.correct || {});
    } else {
      const selected = ans.selected || [];
      const correct = q.correct || [];
      isCorrect = correct.length > 0 && 
                  correct.every(c => selected.includes(c)) && 
                  selected.every(s => correct.includes(s));
    }
    if (isCorrect) correctCount++;
  });

  let html = `
    <div class="card bg-dark text-white text-center mb-4">
      <div class="card-header"><h3>Attempt Finished</h3></div>
      <div class="card-body">
        <h2 class="display-4">${correctCount} / ${quizState.questions.length}</h2>
        <p class="lead">${Math.round((correctCount / quizState.questions.length) * 100)}% correct</p>
      </div>
    </div>

    <h4 class="text-white mb-4">Detailed Review</h4>`;

  // Per question review
  quizState.questions.forEach((q, idx) => {
    const ans = quizState.userAnswers[q.id];
    const isCorrect = q.type === "matching" 
      ? JSON.stringify(ans?.map || {}) === JSON.stringify(q.correct || {})
      : (ans?.selected || []).length > 0 && 
        (q.correct || []).every(c => (ans.selected || []).includes(c)) &&
        (ans.selected || []).every(s => (q.correct || []).includes(s));

    html += `
      <div class="card bg-dark text-white mb-4">
        <div class="card-header ${isCorrect ? 'bg-success' : 'bg-danger'}">
          Question ${idx + 1} — ${isCorrect ? '✔ Correct' : '✘ Incorrect'}
        </div>
        <div class="card-body">
          <p class="lead">${q.text}</p>`;

    if (q.type === "matching") {
      // === Matching / Association Questions ===
      const userMap = ans?.map || {};

      html += `<strong>Your Matching:</strong><div class="mt-2 mb-4">`;
      q.groups.forEach(group => {
        const userVal = userMap[group.respId];
        const correctVal = q.correct?.[group.respId];
        const userChoice = group.choices.find(c => c.id === userVal);
        const correctChoice = group.choices.find(c => c.id === correctVal);
        const right = userVal === correctVal;

        html += `
          <div class="border rounded p-3 mb-2 ${right ? 'border-success bg-success bg-opacity-10' : 'border-danger bg-danger bg-opacity-10'}">
            <strong>${group.respId}:</strong> ${userChoice ? userChoice.text : '—'} 
            ${right ? '✔' : `✘ (correct: ${correctChoice ? correctChoice.text : '—'})`}
          </div>`;
      });
      html += `</div>`;

      // Show correct matching for comparison
      html += `<strong>Correct Matching:</strong><div class="mt-2">`;
      q.groups.forEach(group => {
        const correctVal = q.correct?.[group.respId];
        const correctChoice = group.choices.find(c => c.id === correctVal);
        html += `<div class="border border-success rounded p-3 mb-2 bg-success bg-opacity-10">
                   <strong>${group.respId}:</strong> ${correctChoice ? correctChoice.text : '—'}
                 </div>`;
      });
      html += `</div>`;

    } else {
      // === Single / Multiple Choice ===
      const selected = ans?.selected || [];
      const correct = q.correct || [];

      // Your Answer
      html += `<strong>Your Answer:</strong><div class="mt-2 mb-3">`;
      if (selected.length === 0) {
        html += `<span class="text-warning">No answer selected</span>`;
      } else {
        q.choices
          .filter(c => selected.includes(c.id))
          .forEach(choice => {
            html += `<div class="mb-1">${choice.text}</div>`;
          });
      }
      html += `</div>`;

      // Correct Answer
      html += `<strong>Correct Answer:</strong><div class="mt-2">`;
      q.choices
        .filter(c => correct.includes(c.id))
        .forEach(choice => {
          html += `<div class="text-success">${choice.text}</div>`;
        });
      html += `</div>`;
    }

    html += `</div></div>`;
  });

  $('#quizContainer').html(html);
  $('#questionProgress').empty();
}

$(document).off('keydown.globals').on('keydown.globals', function(e) {
    if (e.key.toLowerCase() === 's' && $('#loadAndStart').length) $('#loadAndStart').trigger('click');
    if (e.key.toLowerCase() === 'r' && $('#resetQuizBtn').length) $('#resetQuizBtn').trigger('click');
  });


window.startQuiz = startQuiz;
window.resetQuiz = resetQuiz;

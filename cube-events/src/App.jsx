import React, { useEffect, useMemo, useState } from 'react';

const TIME_PATTERN = /^\d{4}$/;

// Adjust these values if the thermal label stock or printer tolerances change later.
const PRINT_LAYOUT = {
  // Each PDF/print page is one physical label.
  pageWidthIn: 1.5,
  pageHeightIn: 2,
  labelWidthIn: 1.5,
  labelHeightIn: 2,
  labelBorderInsetIn: 0.08,
  pdfDpi: 300,
};
const EVENTS_PER_LABEL = 2;
const TEXT_MEASURE_DPI = 300;
const LABEL_FONT_FAMILY = '"Oswald", "Arial Narrow", sans-serif';
const NAME_LAYOUT = {
  compact: {
    fontSizeMaxIn: 0.205,
    fontSizeMinIn: 0.03,
    fontSizeStepIn: 0.003,
    lineHeightRatio: 0.17 / 0.205,
    availableHeightIn: 0.68,
    gapBeforeTimeIn: 0.05,
    timeFontSizeMaxIn: 0.16,
  },
  standard: {
    fontSizeMaxIn: 0.235,
    fontSizeMinIn: 0.03,
    fontSizeStepIn: 0.003,
    lineHeightRatio: 0.205 / 0.235,
    availableHeightIn: 1.48,
    gapBeforeTimeIn: 0.09,
    timeFontSizeMaxIn: 0.195,
  },
};

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getNextDateISO(days) {
  const sortedDates = days
    .map((day) => day.date)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  if (!sortedDates.length) {
    return getTodayISO();
  }

  const lastDate = new Date(`${sortedDates[sortedDates.length - 1]}T12:00:00`);
  lastDate.setDate(lastDate.getDate() + 1);
  return lastDate.toISOString().slice(0, 10);
}

function createEvent() {
  return {
    id: crypto.randomUUID(),
    name: '',
    startTime: '',
    endTime: '',
  };
}

function createDay(date = getTodayISO()) {
  return {
    id: crypto.randomUUID(),
    date,
    events: [createEvent()],
  };
}

function sanitizeTimeInput(value) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function parseMilitaryTime(value) {
  if (!TIME_PATTERN.test(value)) {
    return null;
  }

  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2, 4));

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatDateHeading(value) {
  if (!value) {
    return 'Choose a date';
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function compareLabels(left, right) {
  if (left.date !== right.date) {
    return left.date.localeCompare(right.date);
  }

  if (left.startMinutes !== right.startMinutes) {
    return left.startMinutes - right.startMinutes;
  }

  return left.events[0].name.localeCompare(right.events[0].name);
}

function hasEventContent(event) {
  return Boolean(event.name.trim() || event.startTime || event.endTime);
}

function getEventIssues(day, event) {
  if (!hasEventContent(event)) {
    return [];
  }

  const issues = [];
  const startMinutes = parseMilitaryTime(event.startTime);
  const endMinutes = parseMilitaryTime(event.endTime);

  if (!day.date) {
    issues.push('Choose a date for this event.');
  }

  if (!event.name.trim()) {
    issues.push('Enter an event name.');
  }

  if (startMinutes === null) {
    issues.push('Start time must be four digits from 0000 to 2359.');
  }

  if (endMinutes === null) {
    issues.push('End time must be four digits from 0000 to 2359.');
  }

  if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
    issues.push('End time must be later than the start time.');
  }

  return issues;
}

function isPrintableEvent(day, event) {
  return hasEventContent(event) && getEventIssues(day, event).length === 0;
}

function wrapTextLines(ctx, text, maxWidth) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return ['UNTITLED'];
  }

  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (!currentLine || ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

let previewMeasureContext = null;

function getPreviewMeasureContext() {
  if (previewMeasureContext) {
    return previewMeasureContext;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  previewMeasureContext = canvas.getContext('2d');
  return previewMeasureContext;
}

function getEventNameLayout(eventName, compact, ctx) {
  const layoutKey = compact ? 'compact' : 'standard';
  const settings = NAME_LAYOUT[layoutKey];
  const nameText = (eventName.trim() || 'UNTITLED').toUpperCase();
  const fontWeight = 700;
  const contentLeftIn = compact ? 0.16 : 0.18;
  const contentRightInsetIn = compact ? 0.16 : 0.17;
  const circleSizeIn = compact ? 0.15 : 0.18;
  const nameXInsetIn = contentLeftIn + circleSizeIn + 0.08;
  const maxWidthIn = PRINT_LAYOUT.labelWidthIn - contentRightInsetIn - nameXInsetIn;

  if (!ctx) {
    return {
      fontSizeIn: settings.fontSizeMaxIn,
      lineHeightIn: settings.fontSizeMaxIn * settings.lineHeightRatio,
      lines: [nameText],
    };
  }

  let fontSizeIn = settings.fontSizeMaxIn;

  while (fontSizeIn >= settings.fontSizeMinIn) {
    const fontSizePx = fontSizeIn * TEXT_MEASURE_DPI;
    ctx.font = `${fontWeight} ${fontSizePx}px ${LABEL_FONT_FAMILY}`;
    const lines = wrapTextLines(ctx, nameText, maxWidthIn * TEXT_MEASURE_DPI);
    const widestLinePx = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const lineHeightIn = fontSizeIn * settings.lineHeightRatio;
    const totalHeightIn =
      0.01 +
      lines.length * lineHeightIn +
      settings.gapBeforeTimeIn +
      settings.timeFontSizeMaxIn;

    if (widestLinePx <= maxWidthIn * TEXT_MEASURE_DPI && totalHeightIn <= settings.availableHeightIn) {
      return {
        fontSizeIn,
        lineHeightIn,
        lines,
      };
    }

    fontSizeIn -= settings.fontSizeStepIn;
  }

  const fallbackFontSizeIn = settings.fontSizeMinIn;
  ctx.font = `${fontWeight} ${fallbackFontSizeIn * TEXT_MEASURE_DPI}px ${LABEL_FONT_FAMILY}`;
  const fallbackLines = wrapTextLines(ctx, nameText, maxWidthIn * TEXT_MEASURE_DPI);

  return {
    fontSizeIn: fallbackFontSizeIn,
    lineHeightIn: fallbackFontSizeIn * settings.lineHeightRatio,
    lines: fallbackLines,
  };
}

function drawLabelEventOnCanvas(ctx, event, x, topPx, compact) {
  const toPx = (inches) => inches * PRINT_LAYOUT.pdfDpi;
  const labelWidth = toPx(PRINT_LAYOUT.labelWidthIn);
  const circleSize = toPx(compact ? 0.15 : 0.18);
  const contentLeft = x + toPx(compact ? 0.16 : 0.18);
  const contentRight = x + labelWidth - toPx(compact ? 0.16 : 0.17);
  const nameX = contentLeft + circleSize + toPx(0.08);
  const nameMaxWidth = contentRight - nameX;
  const minTimeFontSize = toPx(compact ? 0.145 : 0.165);
  const timeMaxWidth = contentRight - contentLeft;
  const timeText = `${event.startTime} - ${event.endTime}`;
  const nameLayout = getEventNameLayout(event.name, compact, ctx);
  const gapBeforeTimePx = toPx(compact ? NAME_LAYOUT.compact.gapBeforeTimeIn : NAME_LAYOUT.standard.gapBeforeTimeIn);
  const nameTopPx = topPx + toPx(0.01);

  ctx.beginPath();
  ctx.lineWidth = toPx(0.01);
  ctx.arc(
    contentLeft + circleSize / 2,
    topPx + circleSize / 2,
    circleSize / 2,
    0,
    Math.PI * 2,
  );
  ctx.stroke();

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${nameLayout.fontSizeIn * PRINT_LAYOUT.pdfDpi}px ${LABEL_FONT_FAMILY}`;

  nameLayout.lines.forEach((line, index) => {
    ctx.fillText(
      line,
      nameX,
      nameTopPx + index * (nameLayout.lineHeightIn * PRINT_LAYOUT.pdfDpi),
    );
  });

  ctx.textAlign = 'center';
  let timeFontSize = toPx(compact ? 0.16 : 0.195);
  ctx.font = `600 ${timeFontSize}px ${LABEL_FONT_FAMILY}`;

  while (ctx.measureText(timeText).width > timeMaxWidth && timeFontSize > minTimeFontSize) {
    timeFontSize -= toPx(0.005);
    ctx.font = `600 ${timeFontSize}px ${LABEL_FONT_FAMILY}`;
  }

  ctx.fillText(
    timeText,
    contentLeft + timeMaxWidth / 2,
    nameTopPx +
      nameLayout.lines.length * (nameLayout.lineHeightIn * PRINT_LAYOUT.pdfDpi) +
      gapBeforeTimePx,
  );
}

function drawLabelOnCanvas(ctx, label, x, y) {
  const toPx = (inches) => inches * PRINT_LAYOUT.pdfDpi;
  const labelWidth = toPx(PRINT_LAYOUT.labelWidthIn);
  const labelHeight = toPx(PRINT_LAYOUT.labelHeightIn);
  const borderInset = toPx(PRINT_LAYOUT.labelBorderInsetIn);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, labelWidth, labelHeight);

  ctx.strokeStyle = '#111111';
  ctx.lineWidth = toPx(0.015);
  ctx.setLineDash([toPx(0.06), toPx(0.045)]);
  ctx.strokeRect(
    x + borderInset,
    y + borderInset,
    labelWidth - borderInset * 2,
    labelHeight - borderInset * 2,
  );
  ctx.setLineDash([]);
  if (label.events.length > 1) {
    drawLabelEventOnCanvas(ctx, label.events[0], x, y + toPx(0.18), true);
    drawLabelEventOnCanvas(ctx, label.events[1], x, y + toPx(0.98), true);
    return;
  }

  drawLabelEventOnCanvas(ctx, label.events[0], x, y + toPx(0.24), false);
}

function PreviewPage({ label, pageNumber }) {
  return (
    <div className="sheet-page-shell">
      <div className="page-caption">Label {pageNumber}</div>
      <div className="sheet-page">
        <div className={`print-label ${label.events.length > 1 ? 'print-label--multi' : ''}`}>
          <div className="label-border" />
          <div className="label-content">
            <div className="label-events">
              {label.events.map((event) => (
                <div className="label-event" key={event.id}>
                  <div className="label-title-row">
                    <span className="label-marker" aria-hidden="true" />
                    <span
                      className="label-name"
                      style={{
                        fontSize: `${event.nameLayout.fontSizeIn}in`,
                        lineHeight: `${event.nameLayout.lineHeightIn}in`,
                      }}
                    >
                      {event.nameLayout.lines.map((line) => (
                        <span className="label-name-line" key={`${event.id}-${line}`}>
                          {line}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="label-time">
                    {event.startTime} - {event.endTime}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [days, setDays] = useState([createDay()]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [fontMetricsVersion, setFontMetricsVersion] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) {
      return undefined;
    }

    let isActive = true;

    document.fonts.ready.then(() => {
      if (isActive) {
        setFontMetricsVersion((value) => value + 1);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const validationSummary = useMemo(
    () =>
      days.flatMap((day) =>
        day.events.map((event) => ({
          eventId: event.id,
          hasContent: hasEventContent(event),
          issues: getEventIssues(day, event),
        })),
      ),
    [days],
  );

  const printableLabels = useMemo(
    () =>
      days
        .flatMap((day) => {
          const printableEvents = day.events
            .filter((event) => isPrintableEvent(day, event))
            .map((event) => ({
              id: event.id,
              name: event.name.trim(),
              startTime: event.startTime,
              endTime: event.endTime,
              startMinutes: parseMilitaryTime(event.startTime),
            }))
            .sort((left, right) => {
              if (left.startMinutes !== right.startMinutes) {
                return left.startMinutes - right.startMinutes;
              }

              return left.name.localeCompare(right.name);
            });

          const labels = [];

          for (let index = 0; index < printableEvents.length; index += EVENTS_PER_LABEL) {
            const labelEvents = printableEvents.slice(index, index + EVENTS_PER_LABEL);

            labels.push({
              id: `${day.id}-${labelEvents.map((event) => event.id).join('-')}`,
              date: day.date,
              startMinutes: labelEvents[0].startMinutes,
              events: labelEvents,
            });
          }

          return labels;
        })
        .sort(compareLabels),
    [days],
  );

  const previewLabels = useMemo(() => {
    const previewCtx = getPreviewMeasureContext();

    return printableLabels.map((label) => ({
      ...label,
      events: label.events.map((event) => ({
        ...event,
        nameLayout: getEventNameLayout(event.name, label.events.length > 1, previewCtx),
      })),
    }));
  }, [printableLabels, fontMetricsVersion]);

  const hasBlockingErrors = validationSummary.some(
    (entry) => entry.hasContent && entry.issues.length > 0,
  );

  const canOutput = printableLabels.length > 0 && !hasBlockingErrors;
  const totalPages = previewLabels.length;

  function updateDay(dayId, updater) {
    setDays((currentDays) =>
      currentDays.map((day) => (day.id === dayId ? updater(day) : day)),
    );
  }

  function handleDayDateChange(dayId, value) {
    updateDay(dayId, (day) => ({
      ...day,
      date: value,
    }));
  }

  function handleEventChange(dayId, eventId, field, value) {
    updateDay(dayId, (day) => ({
      ...day,
      events: day.events.map((event) => {
        if (event.id !== eventId) {
          return event;
        }

        if (field === 'startTime' || field === 'endTime') {
          return {
            ...event,
            [field]: sanitizeTimeInput(value),
          };
        }

        return {
          ...event,
          [field]: value,
        };
      }),
    }));
  }

  function addEvent(dayId) {
    updateDay(dayId, (day) => ({
      ...day,
      events: [...day.events, createEvent()],
    }));
  }

  function deleteEvent(dayId, eventId) {
    updateDay(dayId, (day) => ({
      ...day,
      events: day.events.filter((event) => event.id !== eventId),
    }));
  }

  function addDay() {
    setDays((currentDays) => [...currentDays, createDay(getNextDateISO(currentDays))]);
  }

  function deleteDay(dayId) {
    setDays((currentDays) => {
      if (currentDays.length === 1) {
        return [createDay()];
      }

      return currentDays.filter((day) => day.id !== dayId);
    });
  }

  async function handlePrint() {
    if (!canOutput) {
      return;
    }

    await document.fonts.ready;
    window.print();
  }

  async function handleExportPdf() {
    if (!canOutput) {
      return;
    }

    setIsExporting(true);
    setExportError('');
    setExportMessage('');

    try {
      await document.fonts.ready;
      const { jsPDF } = await import('jspdf');
      const fileName = `event-labels-${new Date().toISOString().slice(0, 10)}.pdf`;

      const pageWidthPx = Math.round(PRINT_LAYOUT.pageWidthIn * PRINT_LAYOUT.pdfDpi);
      const pageHeightPx = Math.round(PRINT_LAYOUT.pageHeightIn * PRINT_LAYOUT.pdfDpi);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: [PRINT_LAYOUT.pageWidthIn, PRINT_LAYOUT.pageHeightIn],
        compress: true,
      });

      printableLabels.forEach((label, pageIndex) => {
        if (pageIndex > 0) {
          pdf.addPage([PRINT_LAYOUT.pageWidthIn, PRINT_LAYOUT.pageHeightIn], 'portrait');
        }

        const canvas = document.createElement('canvas');
        canvas.width = pageWidthPx;
        canvas.height = pageHeightPx;

        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Unable to create the PDF canvas.');
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawLabelOnCanvas(ctx, label, 0, 0);

        pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          0,
          0,
          PRINT_LAYOUT.pageWidthIn,
          PRINT_LAYOUT.pageHeightIn,
          undefined,
          'FAST',
        );
      });

      pdf.save(fileName);
      setExportMessage(`PDF export sent to your browser as ${fileName}.`);
    } catch (error) {
      setExportMessage('');
      setExportError(error instanceof Error ? error.message : 'PDF export failed.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="editor-panel">
        <div className="hero-card">
          <p className="eyebrow">Printable Event Labels</p>
          <h1>Cube Events for the BIG A## Calendar</h1>
          <p className="hero-copy">
            Build labels across multiple days, preview them live, then print or export a
            one-label-per-page document sized for thermal-style label printing, with up to
            two same-day events grouped onto each label.
          </p>
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              onClick={handleExportPdf}
              disabled={!canOutput || isExporting}
            >
              {isExporting ? 'Exporting PDF...' : 'Export PDF'}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handlePrint}
              disabled={!canOutput}
            >
              Print
            </button>
          </div>
          <div className="status-row">
            <span>{previewLabels.length} printable labels</span>
            <span>
              {previewLabels.reduce((total, label) => total + label.events.length, 0)} valid
              event(s)
            </span>
            <span>{totalPages} page(s)</span>
            <span>24-hour time format</span>
          </div>
          <p className="helper-copy">
            Use four-digit military time like <strong>0900</strong> and{' '}
            <strong>1300</strong>. Output buttons unlock once every filled event is valid.
          </p>
          {exportMessage ? <p className="success-banner">{exportMessage}</p> : null}
          {exportError ? <p className="error-banner">{exportError}</p> : null}
        </div>

        <div className="day-stack">
          {days.map((day, dayIndex) => (
            <section className="day-card" key={day.id}>
              <div className="day-card-header">
                <div>
                  <p className="day-index">Day {dayIndex + 1}</p>
                  <h2>{formatDateHeading(day.date)}</h2>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => deleteDay(day.id)}
                >
                  Remove Day
                </button>
              </div>

              <label className="field">
                <span>Date</span>
                <input
                  type="date"
                  value={day.date}
                  onChange={(event) => handleDayDateChange(day.id, event.target.value)}
                />
              </label>

              <div className="events-list">
                {day.events.map((event, eventIndex) => {
                  const issues = getEventIssues(day, event);
                  const showIssues = hasEventContent(event) && issues.length > 0;

                  return (
                    <div className="event-row" key={event.id}>
                      <div className="event-row-header">
                        <h3>Event {eventIndex + 1}</h3>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => deleteEvent(day.id, event.id)}
                        >
                          Delete
                        </button>
                      </div>

                      <label className="field">
                        <span>Event Name</span>
                        <input
                          type="text"
                          placeholder="Board Meeting"
                          value={event.name}
                          onChange={(inputEvent) =>
                            handleEventChange(day.id, event.id, 'name', inputEvent.target.value)
                          }
                        />
                      </label>

                      <div className="time-grid">
                        <label className="field">
                          <span>Start</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0900"
                            maxLength={4}
                            value={event.startTime}
                            onChange={(inputEvent) =>
                              handleEventChange(
                                day.id,
                                event.id,
                                'startTime',
                                inputEvent.target.value,
                              )
                            }
                          />
                        </label>

                        <label className="field">
                          <span>End</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="1300"
                            maxLength={4}
                            value={event.endTime}
                            onChange={(inputEvent) =>
                              handleEventChange(
                                day.id,
                                event.id,
                                'endTime',
                                inputEvent.target.value,
                              )
                            }
                          />
                        </label>
                      </div>

                      {showIssues ? (
                        <div className="validation-box">
                          {issues.map((issue) => (
                            <p key={issue}>{issue}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <button
                className="secondary-button add-event-button"
                type="button"
                onClick={() => addEvent(day.id)}
              >
                Add Event
              </button>
            </section>
          ))}

          <div className="day-stack-footer">
            <button className="primary-button day-stack-add-button" type="button" onClick={addDay}>
              Add Another Day
            </button>
          </div>
        </div>
      </aside>

      <main className="preview-panel">
        <div className="preview-header">
          <div>
            <p className="eyebrow">Live Preview</p>
            <h2>Chronological print layout</h2>
          </div>
          <p className="preview-note">
            Each preview card is its own 1.5 x 2 inch page. Labels are sorted by date, then
            start time, and each page can hold up to two events from the same date while the
            date itself stays hidden on the printed label.
          </p>
        </div>

        {previewLabels.length ? (
          <div className="preview-pages">
            {previewLabels.map((label, index) => (
              <PreviewPage key={label.id} label={label} pageNumber={index + 1} />
            ))}
          </div>
        ) : (
          <div className="empty-preview">
            <h3>No printable labels yet</h3>
            <p>
              Add an event name plus valid start and end times to see labels appear here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

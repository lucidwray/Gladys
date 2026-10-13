import dayjs from 'dayjs';

import style from './style.css';

const TICKS = 6;

// The label format follows the span: a day shows the hour, longer spans the day, then the month
const formatFor = span => {
  if (span <= 2 * 24 * 3600 * 1000) {
    return 'HH:mm';
  }
  return span <= 60 * 24 * 3600 * 1000 ? 'D MMM' : 'MMM YYYY';
};

// The time axis of the stacked rows (spec §6). It is HTML, not a chart: it spans the same box as the rows' plots, so
// the labels line up with them at any width and after a zoom. `start` and `end` are the x range shown, in ms.
const PowerTimeAxis = ({ start, end, language }) => {
  const span = end - start;
  const format = formatFor(span);
  const ticks = Array.from({ length: TICKS }, (_, index) => {
    const ratio = index / (TICKS - 1);
    return {
      ratio,
      label: dayjs(start + span * ratio)
        .locale(language)
        .format(format)
    };
  });
  return (
    <div class={style.timeAxis} data-power-axis="time">
      {ticks.map((tick, index) => (
        <span
          key={index}
          class={style.timeTick}
          style={{
            left: `${tick.ratio * 100}%`,
            transform: tick.ratio === 0 ? 'none' : tick.ratio === 1 ? 'translateX(-100%)' : 'translateX(-50%)'
          }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  );
};

export default PowerTimeAxis;

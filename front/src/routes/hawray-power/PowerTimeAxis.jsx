import dayjs from 'dayjs';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

import { timeAxisTicks } from './helpers';
import style from './style.css';

// The time axis of the stacked rows (spec §6). It is HTML, not a chart: it spans the same box as the rows' plots, so
// the labels line up with them at any width and after a zoom. `start` and `end` are the x range shown, in ms. The ticks
// follow the strip's measured width, so they are recomputed when the window resizes.
const PowerTimeAxis = ({ start, end, language }) => {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setWidth(ref.current.clientWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const ticks = timeAxisTicks({ start, end, width });
  return (
    <div ref={ref} class={style.timeAxis} data-power-axis="time">
      {ticks.map(tick => (
        <span
          key={tick.time}
          class={style.timeTick}
          style={{
            left: `${tick.ratio * 100}%`,
            transform: tick.ratio === 0 ? 'none' : tick.ratio === 1 ? 'translateX(-100%)' : 'translateX(-50%)'
          }}
        >
          {dayjs(tick.time)
            .locale(language)
            .format(tick.format)}
        </span>
      ))}
    </div>
  );
};

export default PowerTimeAxis;

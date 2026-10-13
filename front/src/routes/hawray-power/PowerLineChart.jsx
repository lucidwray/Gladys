import { Component, createRef } from 'preact';
import { buildPowerChartOptions, POWER_CHART_COLORS, renderPowerChart } from './powerChartOptions';
import { linesChanged, toChartPoints } from './helpers';

// One ApexCharts line chart. `lines` is [{ name, points }]: the series are pushed again only when a line's points
// change by reference (a live sample appends a new array), so the other charts are not redrawn.
// The x window is pinned to [windowStart, windowEnd] unless the user has zoomed (`zoomed`): then it is left alone.
// The x range of a chart: the user's zoom while zoomed, the pinned window otherwise
const axisRange = props =>
  props.zoomed && props.zoomRange
    ? { min: props.zoomRange.min, max: props.zoomRange.max }
    : { min: props.windowStart, max: props.windowEnd };

class PowerLineChart extends Component {
  chartRef = createRef();

  componentDidMount() {
    const { lines, language, zoomable, showToolbar, compact, grouped } = this.props;
    this.chart = renderPowerChart(
      this.chartRef.current,
      buildPowerChartOptions({
        ...this.optionsFromProps(),
        windowStart: axisRange(this.props).min,
        windowEnd: axisRange(this.props).max,
        lines,
        colors: POWER_CHART_COLORS,
        language,
        zoomable,
        showToolbar,
        compact,
        grouped
      })
    );
  }

  componentDidUpdate(previousProps) {
    const props = this.props;
    if (!this.chart) {
      return;
    }
    const linesDiffer = linesChanged(previousProps.lines, props.lines);
    const layoutChanged =
      previousProps.height !== props.height || previousProps.showXAxisLabels !== props.showXAxisLabels;
    const windowChanged =
      previousProps.windowStart !== props.windowStart ||
      previousProps.windowEnd !== props.windowEnd ||
      previousProps.zoomed !== props.zoomed ||
      previousProps.zoomRange !== props.zoomRange;
    if (!linesDiffer && !layoutChanged && !windowChanged) {
      return;
    }
    // One update, not two: a series update and an axis update in separate calls race in ApexCharts, and the
    // axis can come back to its build-time range. The user's zoom range is set again with the series (replacing
    // the series makes ApexCharts drop the zoom)
    const { min, max } = axisRange(props);
    const update = {
      chart: { height: props.height },
      xaxis: { labels: { show: props.showXAxisLabels }, min, max }
    };
    if (linesDiffer) {
      update.series = props.lines.map(line => ({ name: line.name, data: toChartPoints(line.points) }));
    }
    // The fourth argument is updateSyncedCharts: false, so this chart's height and axis labels stay its own
    this.chart.updateOptions(update, false, false, false);
  }

  componentWillUnmount() {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  optionsFromProps() {
    const { chartId, height, showXAxisLabels, onZoomChange } = this.props;
    return { chartId, height, showXAxisLabels, onZoomChange };
  }

  render() {
    return <div ref={this.chartRef} />;
  }
}

export default PowerLineChart;

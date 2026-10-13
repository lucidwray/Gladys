import { Component, createRef } from 'preact';
import { buildPowerChartOptions, POWER_CHART_COLORS, renderPowerChart } from './powerChartOptions';
import { linesChanged, toChartPoints } from './helpers';

// One ApexCharts line chart. `lines` is [{ name, points }]: the series are pushed again only when a line's points
// change by reference (a live sample appends a new array), so the other charts are not redrawn.
class PowerLineChart extends Component {
  chartRef = createRef();

  componentDidMount() {
    const { chartId, height, lines, language, zoomable, showToolbar, compact, showXAxisLabels } = this.props;
    this.chart = renderPowerChart(
      this.chartRef.current,
      buildPowerChartOptions({
        chartId,
        height,
        lines,
        colors: POWER_CHART_COLORS,
        language,
        zoomable,
        showToolbar,
        compact,
        showXAxisLabels
      })
    );
  }

  componentDidUpdate(previousProps) {
    if (this.chart && linesChanged(previousProps.lines, this.props.lines)) {
      this.chart.updateSeries(this.props.lines.map(line => ({ name: line.name, data: toChartPoints(line.points) })));
    }
  }

  componentWillUnmount() {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  render() {
    return <div ref={this.chartRef} />;
  }
}

export default PowerLineChart;

import ApexCharts from 'apexcharts';
import fr from 'apexcharts/dist/locales/fr.json';
import en from 'apexcharts/dist/locales/en.json';
import de from 'apexcharts/dist/locales/de.json';
import es from 'apexcharts/dist/locales/es.json';

import { toChartPoints } from './helpers';

// Every Power chart joins this group: zooming one zooms them all (spec §6). The shared line options of
// components/boxs/chart are not used: they hide the toolbar and do not set a group, so these are built here.
export const POWER_CHART_GROUP = 'hawray-power';

export const POWER_CHART_COLORS = [
  '#316cbe',
  '#d63031',
  '#00b894',
  '#fdcb6e',
  '#6c5ce7',
  '#00cec9',
  '#e84393',
  '#e17055',
  '#636e72'
];

const LOCALES = [fr, en, de, es];

export const buildPowerChartOptions = ({
  chartId,
  height,
  lines,
  colors,
  language,
  zoomable,
  showToolbar,
  compact,
  showXAxisLabels
}) => ({
  chart: {
    id: chartId,
    group: POWER_CHART_GROUP,
    type: 'line',
    height,
    fontFamily: 'inherit',
    parentHeightOffset: 0,
    locales: LOCALES,
    defaultLocale: language,
    animations: {
      enabled: false
    },
    toolbar: {
      show: showToolbar,
      autoSelected: 'zoom',
      tools: {
        download: false,
        selection: false,
        zoom: true,
        zoomin: false,
        zoomout: false,
        pan: false,
        reset: true
      }
    },
    zoom: {
      enabled: zoomable,
      type: 'x'
    }
  },
  series: lines.map(line => ({ name: line.name, data: toChartPoints(line.points) })),
  colors,
  dataLabels: {
    enabled: false
  },
  stroke: {
    width: 2,
    lineCap: 'round',
    curve: 'smooth'
  },
  markers: {
    size: 0
  },
  grid: {
    strokeDashArray: 4
  },
  xaxis: {
    type: 'datetime',
    labels: {
      show: showXAxisLabels,
      datetimeUTC: false
    },
    axisBorder: {
      show: false
    },
    tooltip: {
      enabled: false
    }
  },
  yaxis: {
    // Each chart has its own scale, from 0 (spec §6)
    min: 0,
    forceNiceScale: true,
    labels: {
      show: !compact,
      formatter: value => `${Math.round(value)}`
    }
  },
  legend: {
    show: !compact,
    position: 'bottom'
  },
  tooltip: {
    followCursor: true
  }
});

// Creates the ApexCharts instance on mount and pushes new series into it; a range change remounts the chart
// (the caller sets a key), so its zoom starts from the new range.
export const renderPowerChart = (element, options) => {
  const chart = new ApexCharts(element, options);
  chart.render();
  return chart;
};

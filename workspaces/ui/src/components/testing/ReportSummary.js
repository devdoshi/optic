import React, { useCallback, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { opticEngine } from '@useoptic/domain';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import classNames from 'classnames';
import Color from 'color';
import dateFormatRelative from 'date-fns/formatRelative';
import dateFormatDistance from 'date-fns/formatDistance';
import { parseISO as dateParseISO } from 'date-fns';
import { usePageTitle } from '../Page';
import { useReportPath } from '../../contexts/TestingDashboardContext';
import _sortBy from 'lodash.sortby';

import {
  createEndpointDescriptor,
  getEndpointId,
} from '../../utilities/EndpointUtilities';
import { StableHasher } from '../../utilities/CoverageUtilities';

import ScheduleIcon from '@material-ui/icons/Schedule';
import FiberManualRecordIcon from '@material-ui/icons/FiberManualRecord';
import { Card } from '@material-ui/core';
import Skeleton from '@material-ui/lab/Skeleton';
import { ReportEndpointLink } from './report-link';
import EndpointReport from './EndpointReport';

export default function ReportSummary(props) {
  const { capture, report, spec, currentEndpointId } = props;
  const classes = useStyles();
  const classesHttpMethods = useHttpMethodStyles();
  const { captureId } = capture;
  const reportPath = useReportPath(captureId);

  const summary = useMemo(() => createSummary(capture, spec, report), [
    capture,
    spec,
    report,
  ]);

  // closing endpoint upon clicking report outside list
  const history = useHistory();
  const onClickList = useCallback((e) => {
    // clicks inside list don't close the current endpoint
    e.stopPropagation();
  });
  const onClickContainer = useCallback((e) => {
    history.replace(reportPath);
  });

  const undocumentedEndpoints = useMemo(
    () =>
      _sortBy(
        props.undocumentedEndpoints,
        (undocumented) => -undocumented.count,
        (undocumented) => undocumented.path,
        (undocumented) => undocumented.method
      ),
    [props.undocumentedEndpoints]
  );

  const {
    endpoints,
    isCapturing,
    totalInteractions,
    totalCompliantInteractions,
    totalDiffs,
    totalUnmatchedPaths,
  } = summary;

  const now = new Date();

  usePageTitle(
    summary.buildId && summary.environment
      ? `Report for '${summary.buildId}' in '${summary.environment}'`
      : 'Report'
  );

  return (
    <div className={classes.root} onClick={onClickContainer}>
      <div className={classes.reportMeta}>
        <div className={classes.captureTime}>
          {summary.isCapturing ? (
            <div className={classes.liveIndicator}>
              <FiberManualRecordIcon className={classes.recordIcon} />
              <span className={classes.liveLabel}>LIVE</span>
            </div>
          ) : (
            <ScheduleIcon className={classes.historyIcon} />
          )}
          {summary.isCapturing ? (
            <>since {dateFormatRelative(summary.createdAt, now)}</>
          ) : (
            <>
              ended {dateFormatRelative(summary.completedAt, now)} after{' '}
              {dateFormatDistance(summary.completedAt, summary.createdAt)}
            </>
          )}
        </div>
      </div>

      <div className={classes.stats}>
        <SummaryStats
          totalInteractions={totalInteractions}
          totalDiffs={totalDiffs}
          totalUnmatchedPaths={totalUnmatchedPaths}
          totalUndocumentedEndpoints={undocumentedEndpoints.length}
        />
        <h4 className={classes.buildName}>
          from capturing interactions for build <code>{summary.buildId}</code>{' '}
          in <code>{summary.environment}</code>
        </h4>
      </div>

      <h4 className={classes.endpointsHeader}>Endpoints</h4>

      {endpoints.length > 0 ? (
        <ul className={classes.endpointsList} onClick={onClickList}>
          {endpoints.map((endpoint) => {
            const endpointHeader = (
              <div className={classes.endpointHeader}>
                <span
                  className={classNames(
                    classes.endpointMethod,
                    classesHttpMethods[endpoint.descriptor.httpMethod]
                  )}
                >
                  {endpoint.descriptor.httpMethod}
                </span>
                <code className={classes.endpointPath}>
                  {endpoint.descriptor.fullPath}
                </code>

                <div className={classes.endpointStats}>
                  {endpoint.counts.diffs > 0 &&
                    process.env
                      .REACT_APP_TESTING_DASHBOARD_ENDPOINT_DIFF_STATS ===
                      'true' && (
                      <span
                        className={classNames(
                          classes.endpointChip,
                          classes.endpointDiffsChip
                        )}
                      >
                        <strong>{endpoint.counts.diffs}</strong>
                        {endpoint.counts.diffs > 1 ? ' diffs' : ' diff'}
                      </span>
                    )}
                  {endpoint.counts.incompliant > 0 ? (
                    <span
                      className={classNames(
                        classes.endpointChip,
                        classes.endpointIncompliantChip
                      )}
                    >
                      <strong>
                        {endpoint.counts.incompliant}/
                        {endpoint.counts.interactions}
                      </strong>
                      {' incompliant'}
                    </span>
                  ) : (
                    <span
                      className={classNames(
                        classes.endpointChip,
                        classes.endpointCompliantChip
                      )}
                    >
                      <strong>
                        {endpoint.counts.compliant}/
                        {endpoint.counts.interactions}
                      </strong>
                      {' compliant'}
                    </span>
                  )}
                </div>
              </div>
            );
            return (
              <li
                key={endpoint.id}
                className={classNames(classes.endpointsListItem, {
                  [classes.isCurrent]:
                    currentEndpointId && endpoint.id === currentEndpointId,
                })}
              >
                <Card className={classes.endpointCard}>
                  {process.env.REACT_APP_TESTING_DASHBOARD_ENDPOINT_DETAILS ===
                  'true' ? (
                    <ReportEndpointLink
                      replace
                      className={classes.endpointLink}
                      captureId={captureId}
                      endpointId={endpoint.id}
                    >
                      {endpointHeader}
                    </ReportEndpointLink>
                  ) : (
                    <div className={classes.endpointLink}>{endpointHeader}</div>
                  )}
                  {currentEndpointId && endpoint.id === currentEndpointId && (
                    <EndpointReport endpoint={endpoint} captureId={captureId} />
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        // @TODO: revisit this empty state
        <p>No endpoints have been documented yet</p>
      )}

      {process.env.REACT_APP_TESTING_DASHBOARD_UNDOCUMENTED_ENDPOINTS ===
        'true' && (
        <>
          <h4 className={classes.endpointsHeader}>Undocumented Endpoints</h4>

          {undocumentedEndpoints.length > 0 && (
            <ul className={classes.endpointsList}>
              {undocumentedEndpoints.map((undocumented) => (
                <li
                  key={undocumented.method + undocumented.path}
                  className={classNames(
                    classes.endpointsListItem,
                    classes.isUndocumented
                  )}
                >
                  <Card className={classes.endpointCard}>
                    <div className={classes.endpointHeader}>
                      <span
                        className={classNames(
                          classes.endpointMethod,
                          classesHttpMethods[undocumented.method]
                        )}
                      >
                        {undocumented.method}
                      </span>
                      <code className={classes.endpointPath}>
                        {undocumented.path}
                      </code>

                      <div className={classes.endpointStats}>
                        <span
                          className={classNames(
                            classes.endpointChip,
                            classes.endpointIncompliantChip
                          )}
                        >
                          <strong>
                            {undocumented.count}/{undocumented.count}
                          </strong>
                          {' incompliant'}
                        </span>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
ReportSummary.displayName = 'Testing/ReportSummary';

function SummaryStats({
  totalInteractions,
  totalDiffs,
  totalUnmatchedPaths,
  totalUndocumentedEndpoints,
}) {
  const classes = useStyles();

  const diffsStat =
    process.env.REACT_APP_TESTING_DASHBOARD_ENDPOINT_DIFF_STATS === 'true' ? (
      <>
        yielding in <Stat value={totalDiffs} label="diff" />
      </>
    ) : (
      <>
        of which{' '}
        <Stat value={totalDiffs} label="incompliant" pluralize={false} />
      </>
    );

  const undocumentedStat =
    process.env.REACT_APP_TESTING_DASHBOARD_UNDOCUMENTED_ENDPOINTS ===
    'true' ? (
      <Stat value={totalUndocumentedEndpoints} label="undocumented endpoint" />
    ) : (
      <>
        <Stat
          value={totalUnmatchedPaths}
          label="against
        undocumented endpoints"
          pluralize={false}
        />
      </>
    );

  return (
    <Typography variant="h6" color="primary" style={{ fontWeight: 200 }}>
      Optic observed <Stat value={totalInteractions} label="interaction" />,{' '}
      {diffsStat} and {undocumentedStat}.
    </Typography>
  );
}
SummaryStats.displayName = 'Testing/ReportSummary/SummaryStats';

function Stat({ value = 0, label = '', pluralize = true }) {
  return (
    <span>
      {value !== 0 && (
        <Typography
          variant="h6"
          component="span"
          color="secondary"
          style={{ fontWeight: 800 }}
        >
          {value}{' '}
        </Typography>
      )}
      <Typography variant="h6" component="span" style={{ fontWeight: 800 }}>
        {value === 0 && 'no '}
        {label}
        {!pluralize || value === 1 ? '' : 's'}
      </Typography>
    </span>
  );
}

export function LoadingReportSummary() {
  const classes = useStyles();

  return (
    <div className={classes.root}>
      <div className={classes.reportMeta}>
        <Skeleton width="20%" height="1rem" />
      </div>

      <div className={classes.stats}>
        <Skeleton width="100%" height="2.8rem" />
        <Skeleton width="30%" height="2.8rem" />
        <h4 className={classes.buildName}>
          <Skeleton width="60%" height="1.5rem" />
        </h4>
      </div>

      <Skeleton width="85px" height="1rem" />

      <ul className={classes.endpointsList}>
        <li className={classes.endpointsListItem}>
          <div className={classes.endpointHeader}>
            <span className={classes.endpointMethod}>
              <Skeleton width="40px" height="2rem" />
            </span>
            <span className={classes.endpointPath}>
              <Skeleton width="70%" height="2rem" />
            </span>

            <div className={classes.endpointStats}>
              <Skeleton width="45px" height="2rem" style={{ marginRight: 8 }} />
              <Skeleton width="58px" height="2rem" />
            </div>
          </div>
        </li>

        <li className={classes.endpointsListItem}>
          <div className={classes.endpointHeader}>
            <span className={classes.endpointMethod}>
              <Skeleton width="40px" height="2rem" />
            </span>
            <span className={classes.endpointPath}>
              <Skeleton width="60%" height="2rem" />
            </span>

            <div className={classes.endpointStats}>
              <Skeleton width="40px" height="2rem" style={{ marginRight: 8 }} />
              <Skeleton width="50px" height="2rem" />
            </div>
          </div>
        </li>

        <li className={classes.endpointsListItem}>
          <div className={classes.endpointHeader}>
            <span className={classes.endpointMethod}>
              <Skeleton width="40px" height="2rem" />
            </span>
            <span className={classes.endpointPath}>
              <Skeleton width="60%" height="2rem" />
            </span>

            <div className={classes.endpointStats}>
              <Skeleton width="40px" height="2rem" />
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}

// Styles
// -------
const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3, 4),
    maxWidth: theme.breakpoints.values.lg,
    flexGrow: 1,
  },

  reportMeta: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: theme.spacing(3),
  },

  captureTime: {
    display: 'flex',
    alignItems: 'center',
    color: theme.palette.grey[500],
    fontSize: theme.typography.pxToRem(12),
  },

  buildName: {
    ...theme.typography.subtitle2,
    fontWeight: theme.typography.fontWeightLight,
    margin: 0,
    marginTop: theme.spacing(0.25),
    color: theme.palette.primary.light,

    '& code': {
      color: theme.palette.primary.light,
      fontWeight: 'bold',
    },
  },

  stats: {
    marginBottom: theme.spacing(6),
  },

  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    marginRight: theme.spacing(0.5),
  },

  recordIcon: {
    width: 16,
    height: 16,
    marginRight: theme.spacing(0.5),
    fill: theme.palette.secondary.main,
  },

  liveLabel: {
    ...theme.typography.caption,
  },

  historyIcon: {
    width: 14,
    height: 14,
    marginRight: theme.spacing(0.5),
  },

  summaryStat: {},

  endpointsHeader: {
    ...theme.typography.overline,
    color: '#818892',
    borderBottom: `1px solid #e3e8ee`,
  },

  endpointsList: {
    margin: theme.spacing(0, -2),
    padding: 0,
    listStyleType: 'none',
  },

  isUndocumented: {}, // for use below

  endpointsListItem: {
    '&$isUndocumented': {
      padding: theme.spacing(1, 0),
    },
  },

  endpointCard: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'rgba(255,255,255,0)',
    boxShadow: 'none',

    willChange: 'backgroundColor',
    transition: '0.1s ease-out backgroundColor',

    '$isCurrent &': {
      margin: theme.spacing(1, 0),
      boxShadow: theme.shadows[2],
      backgroundColor: 'rgba(255,255,255,1)',
    },
  },

  endpointLink: {
    flexGrow: 1,
    padding: theme.spacing(1, 0),
    textDecoration: 'none',
    color: 'inherit',

    '&:hover': {
      backgroundColor: theme.palette.grey[100],
    },

    '$isCurrent &': {
      backgroundColor: 'transparent',
      padding: 0,

      '&:hover': {
        backgroundColor: 'transparent',
      },
    },
  },

  endpointHeader: {
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr max-content',
    gridColumnGap: theme.spacing(2),
    alignItems: 'center',
    padding: theme.spacing(0, 2),
    // paddingTop: 0,
    // paddingBottom: 0,

    willChange: 'padding',
    transition: '0.1s ease-out padding',

    '$isCurrent &': {
      padding: theme.spacing(2, 2),
      // paddingTop: theme.spacing(2),
      // paddingBottom: theme.spacing(2),
    },
  },

  endpointMethod: {
    padding: theme.spacing(0.5),
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: theme.shape.borderRadius,

    fontWeight: theme.typography.fontWeightRegular,

    '$isUndocumented &': {
      opacity: 0.5,
    },
  },

  endpointPath: {
    fontSize: theme.typography.pxToRem(13),
    color: theme.palette.primary.main,

    '$isUndocumented &': {
      opacity: 0.8,
      fontStyle: 'italic',
    },
  },

  endpointStats: {
    display: 'flex',
  },

  endpointChip: {
    flexGrow: 0,
    flexShrink: 0,

    height: theme.spacing(3),
    padding: theme.spacing(0, 1),
    marginRight: theme.spacing(1),

    borderRadius: theme.spacing(3 / 2),
    fontSize: theme.typography.pxToRem(11),
    lineHeight: `${theme.spacing(3)}px`,

    '& > strong': {
      fontSize: theme.typography.pxToRem(13),
    },

    '$isUndocumented &': {
      opacity: 0.6,
    },
  },

  endpointDiffsChip: {
    background: Color(theme.palette.error.light).lighten(0.3).hex(),

    color: Color(theme.palette.error.dark).darken(0.5).hex(),
  },

  endpointIncompliantChip: {
    background: Color(theme.palette.warning.light).lighten(0.3).hex(),
    color: Color(theme.palette.warning.dark).darken(0.5).hex(),
  },

  endpointCompliantChip: {
    background: Color(theme.palette.success.light).lighten(0.3).hex(),
    color: Color(theme.palette.success.dark).darken(0.5).hex(),
  },

  // states
  isCurrent: {},
}));

// TODO: Consider moving this to PathAndMethod or some other more general module, for consistency.
// Take note that probably means allowing injecting base styles, as context dictates a lot of that.
const useHttpMethodStyles = makeStyles((theme) => {
  const base = {
    color: '#fff',
  };

  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].reduce(
    (styles, httpMethod) => {
      const color = theme.palette.httpMethods[httpMethod];
      styles[httpMethod] = {
        ...base,
        backgroundColor: color.dark,
      };
      return styles;
    },
    {}
  );
});

const CoverageConcerns = opticEngine.com.useoptic.coverage;

// View models
// -----------
// TODO: consider moving these into their own modules or another appropriate spot (probably stable
// for the entire dashboard context if not all of the app?)

function createSummary(capture, spec, report) {
  const { apiName, endpoints: specEndpoints } = spec;

  const totalInteractions = getCoverageCount(
    CoverageConcerns.TotalInteractions()
  );
  const totalUnmatchedPaths = getCoverageCount(
    CoverageConcerns.TotalUnmatchedPath()
  );

  const endpoints = specEndpoints.map((endpoint, i) => {
    const endpointDescriptor = createEndpointDescriptor(endpoint, spec);
    const endpointId = getEndpointId(endpoint);

    const { pathId, httpMethod } = endpointDescriptor;

    const interactionsCounts = getCoverageCount(
      CoverageConcerns.TotalForPathAndMethod(pathId, httpMethod)
    );
    const compliantCount = getCoverageCount(
      CoverageConcerns.TotalForPathAndMethodWithoutDiffs(pathId, httpMethod)
    );
    const incompliantInteractions = interactionsCounts - compliantCount;
    const diffsCount = incompliantInteractions * (i % 3 === 0 ? 1 : 2); // TODO: Hardcoded test value, replace by deriving from report,

    return {
      id: endpointId,
      pathId: endpoint.pathId,
      method: endpoint.method,
      descriptor: endpointDescriptor,
      counts: {
        interactions: interactionsCounts,
        diffs: diffsCount,
        compliant: compliantCount,
        incompliant: incompliantInteractions,
      },
    };
  });

  const totalDiffs = endpoints // TODO: Hardcoded test value, replace by deriving from report
    .map((endpoint) => endpoint.counts.diffs)
    .reduce((sum, num) => sum + num, 0);
  const totalCompliantInteractions = totalInteractions - totalDiffs;

  const buildIdTag = capture.tags.find(({ name }) => name === 'buildId');
  const envTag = capture.tags.find(({ name }) => name === 'environmentName');

  return {
    apiName,
    createdAt: asDate(capture.createdAt),
    updatedAt: asDate(capture.updatedAt),
    completedAt: asDate(capture.completedAt),
    isCapturing: !capture.completedAt,
    buildId: (buildIdTag && buildIdTag.value) || '',
    environment: (envTag && envTag.value) || '',
    endpoints: _sortBy(
      endpoints,
      (endpoint) => -endpoint.counts.incompliant,
      (endpoint) => totalDiffs - endpoint.counts.diffs,
      (endpoint) => endpoint.descriptor.fullPath,
      (endpoint) => endpoint.method
    ),
    totalInteractions,
    totalUnmatchedPaths,
    totalDiffs,
    totalCompliantInteractions,
  };

  function getCoverageCount(concern) {
    const key = StableHasher.hash(concern);
    return report.coverageCounts[key] || 0;
  }

  function asDate(isoDate) {
    return isoDate && dateParseISO(isoDate);
  }
}

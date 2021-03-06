import React, { useState } from 'react';
import { withTrafficSessionContext } from '../../contexts/TrafficSessionContext';
import { Interpreters, JsonHelper, RequestDiffer, ShapesCommands, toInteraction } from '@useoptic/domain';
import { RfcContext, withRfcContext } from '../../contexts/RfcContext';
import DiffPage from './DiffPage';
import { PathIdToPathString } from '../paths/PathIdToPathString';
import { DiffToDiffCard } from './DiffCopy';
import PreCommit from '../navigation/PreCommit';
import { withNavigationContext } from '../../contexts/NavigationContext';
import compose from 'lodash.compose';
import { NamerStore } from '../shapes/Namer';
import SimulatedCommandContext from './SimulatedCommandContext';
import { queryStringDiffer } from './DiffUtilities';
import {track} from '../../Analytics';

class RequestDiffX extends React.Component {
  handleDiscard = async () => {
    const { specService, eventStore, rfcId, match } = this.props;
    const { requestId } = match.params;
    const { pushRelative } = this.props;

    const events = await specService.listEvents()
    eventStore.remove(rfcId)
    eventStore.bulkAdd(rfcId, events)

    pushRelative('/requests/'+requestId);
  }
  render() {
    const { match } = this.props;
    const { specService } = this.props;
    const { diffStateProjections, diffSessionManager, rfcService, eventStore, rfcId } = this.props;
    const { diffState } = diffSessionManager;
    const { requestId } = match.params;
    const rfcState = rfcService.currentState(rfcId);
    const compoundInterpreter = new Interpreters.CompoundInterpreter(rfcState.shapesState);

    const { sampleItemsWithResolvedPaths } = diffStateProjections;
    const matchingSampleItems = sampleItemsWithResolvedPaths.filter(i => i.requestId === requestId);

    const startableSampleItems = matchingSampleItems.filter(x => diffSessionManager.isStartable(diffState, x));
    //if the diff for this request is finished, show Approve/Discard Modal

    for (let item of startableSampleItems) {
      const interaction = toInteraction(item.sample);
      const plugins = queryStringDiffer(rfcState.shapesState, item.sample)
      const diffIterator = JsonHelper.iteratorToJsIterator(RequestDiffer.compare(interaction, rfcState, plugins));

      const diff = { [Symbol.iterator]: () => diffIterator };
      for (let diffItem of diff) {
        const allInterpretations = JsonHelper.seqToJsArray(compoundInterpreter.interpret(diffItem));
        return this.renderWrapped(item, (
          <DiffPageStateManager
            item={item}
            diff={diffItem}
            diffSessionManager={diffSessionManager}
            interpretations={allInterpretations}
            onDiscard={this.handleDiscard}
          />
        ));
      }
    }

    return (
      <PreCommit
        taggedIds={diffSessionManager.getTaggedIds()}
        requestId={requestId}
        onSave={async (commitMessage) => {

          const addedFirst = rfcState.requestsState.justAddedFirst

          const examples = diffSessionManager.listExamplesToAdd();
          diffSessionManager.reset();
          await specService.saveEvents(eventStore, rfcId)
          await Promise.all(
            [...examples]
              .map((exampleItem) => {
                return specService.saveExample(exampleItem.sample, exampleItem.requestId)
              })
          )

          const redirectTo = `/requests/${requestId}`

          if (addedFirst) {
            this.props.pushRelative(redirectTo+'?documented_endpoint=true')
            track('Documented First Endpoint in an API')
          } else {
            this.props.pushRelative(redirectTo)
          }
        }}
        onDiscard={this.handleDiscard}
      />
    )
  }

  renderWrapped(item, child) {

    const { diffSessionManager } = this.props;

    const handleCommands = (...commands) => {
      this.props.handleCommands(...commands);
      diffSessionManager.acceptCommands(item, commands);
      return diffSessionManager.tagIds
    };

    const { children, ...rest } = this.props; // @GOTCHA assumes withRfcContext on parent component

    const rfcContext = {
      ...rest,
      handleCommands,
      handleCommand: handleCommands,
    };

    return (
      <RfcContext.Provider value={rfcContext}>
        {child}
      </RfcContext.Provider>
    );
  }

}

const DiffPageStateManager = withRfcContext((props) => {
  const {
    item,
    diff,
    interpretations,
    handleCommands: applyCommands,
    rfcId,
    diffSessionManager,
    specService,
    eventStore,
    queries,
    onDiscard
  } = props;
  const [interpretationIndex, setInterpretationIndex] = useState(0);
  const [dependentCommands, setDependentCommands] = useState([]);
  const interpretation = interpretations[interpretationIndex]

  if (!interpretation) {
    //reset internal
    setTimeout(() => setInterpretationIndex(0), 1)
    return null
  }

  const commands = interpretation ? JsonHelper.seqToJsArray(interpretation.commands) : [];
  const { sample, pathId, requestId, index } = item;

  const diffCard = DiffToDiffCard(diff, queries)

  return (
    <SimulatedCommandContext
      shouldSimulate={true}
      rfcId={rfcId}
      eventStore={eventStore}
      commands={[...commands, ...dependentCommands]}
      specService={specService}
    >
      <NamerStore nameShape={(shapeId, name) => {
        setDependentCommands([
          ...dependentCommands,
          ShapesCommands.RenameShape(shapeId, name)
        ])
      }}>
        <DiffPage
          //request context
          url={sample.request.url}
          path={<PathIdToPathString pathId={pathId} />}
          method={sample.request.method}
          requestId={requestId}

          //diff / interpretations
          diff={diffCard}
          interpretation={interpretation}
          interpretationsLength={interpretations.length}
          interpretationsIndex={interpretationIndex}
          setInterpretationIndex={setInterpretationIndex}
          applyCommands={(...commands) => applyCommands(...commands, ...dependentCommands)}

          //observation
          observed={{
            statusCode: sample.response.statusCode,
            requestContentType: sample.request.headers['content-type'],
            queryString: sample.request.queryParameters || {},
            requestBody: sample.request.body,
            responseContentType: sample.response.headers['content-type'],
            responseBody: sample.response.body
          }}

          //control
          onSkip={() => {
            diffSessionManager.skipInteraction(index)
          }}
          onDiscard={onDiscard}
        />
      </NamerStore>
    </SimulatedCommandContext>
  );
});

export default compose(
  withTrafficSessionContext,
  withNavigationContext,
  withRfcContext
)(RequestDiffX);

import React, { useContext, useEffect, useState } from 'react';
import { GenericContextFactory } from './GenericContextFactory';

const {
  Context: SpecServiceContext,
  withContext: withSpecServiceContext,
} = GenericContextFactory(null);

class SpecServiceStore extends React.Component {
  state = { enabledFeatures: null };

  componentDidMount() {
    const { specService, specServiceEvents } = this.props;
    if (!specServiceEvents) {
      console.warn('I need specServiceEvents');
      debugger;
    } else {
      specServiceEvents.on('events-updated', () => {
        this.forceUpdate();
      });
    }

    const determineEnabledFeatures = async () => {
      const enabledFeatures = await specService.getEnabledFeatures();

      this.setState({ enabledFeatures });
    };

    determineEnabledFeatures();
  }

  render() {
    const { specService } = this.props;
    const { enabledFeatures } = this.state;

    return (
      <SpecServiceContext.Provider value={{ specService, enabledFeatures }}>
        {this.props.children}
      </SpecServiceContext.Provider>
    );
  }
}

function useSpecService() {
  const { specService } = useContext(SpecServiceContext);
  return specService;
}

function useEnabledFeatures() {
  const specContext = useContext(SpecServiceContext);

  if (!specContext)
    throw Error(
      'useEnabledFeatures can only be used inside SpecServiceContext'
    );

  return specContext.enabledFeatures;
}

export {
  withSpecServiceContext,
  SpecServiceContext,
  SpecServiceStore,
  useSpecService,
  useEnabledFeatures,
};

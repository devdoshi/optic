import React from 'react'
import {Redirect, Switch, Route} from 'react-router-dom';
import path from 'path'
import MasterView from './components/navigation/MasterView';

const paths = {
	newRoot: () => '/new',
	example: () => '/examples/:exampleId',
	apiRoot: (base) => base,
	requestPage: (base) => `${base}/requests/:requestId`,
	conceptPage: (base) => `${base}/concepts/:conceptId`,
}


class APIEditorRoutes extends React.Component {
	render() {

		const {url, path, params} = this.props.match
		const isNew = path === paths.newRoot()

		//@todo get examples showing
		return (
			<div>
				<MasterView content={
					<Switch>
						<Route exact path={paths.newRoot(url)} component={() => <>NEW</> }/>
						<Route path={paths.requestPage(url)} component={({match}) => <>Request Page for {match.params.requestId}</>}/>
						<Route path={paths.conceptPage(url)} component={({match}) => <>Concept Page for {match.params.conceptId}</>}/>
						<Redirect to={paths.apiRoot(url)}/>
					</Switch>
				}/>
			</div>
		);
	}
}

class AppRoutes extends React.Component {
	render() {
		return (
			<div>
				<Switch>
					<Route path={paths.newRoot()} component={APIEditorRoutes} />
					<Route path={paths.example()} component={APIEditorRoutes}/>
					<Redirect to={paths.newRoot()}/>
				</Switch>
			</div>
		);
	}
}

export default AppRoutes;
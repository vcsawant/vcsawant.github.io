import React from 'react'
import PropTypes from 'prop-types'
import Helmet from 'react-helmet'

import NavBar from '../components/navbar'
import './index.css'


class Layout extends React.Component {
  constructor(props) {
    super(props);
    this.state = { navBarVisible: true };
  }
  toggleNavBar() {
    this.setState((prevState) => ({ navBarVisible: !prevState.navBarVisible }))
  }
  render() {
    var contentclass = this.state.navBarVisible ? 'content open' : 'content';
    var btnclass = this.props.isOpen ? 'navbtn open' : 'navbtn';
    var icon = this.props.isOpen ? '<' : '>';
    return (
      <div>
        <Helmet
          title={this.props.data.site.siteMetadata.title}
          meta={[
            { name: 'description', content: 'Sample' },
            { name: 'keywords', content: 'sample, something' },
          ]}
        />
        <NavBar isOpen={this.state.navBarVisible}>
        </NavBar>
        <div className={contentclass}
        > 
        <button className={btnclass} onClick={() => (this.toggleNavBar())}>{icon}</button>
          {this.props.children()}
        </div>
      </div>
    )
  }
}

export default Layout

export const query = graphql`
  query SiteTitleQuery {
    site {
      siteMetadata {
        title
      }
    }
  }
`

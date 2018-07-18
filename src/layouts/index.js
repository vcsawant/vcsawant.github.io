import React from 'react'
import PropTypes from 'prop-types'
import Helmet from 'react-helmet'

import Header from '../components/header'
import NavBar from '../components/navbar'
import './index.css'


class Layout extends React.Component{
  constructor(props){
    super(props);
    this.state = {navBarVisible: true};
  }
  toggleNavBar(){
    this.setState((prevState)=>({navBarVisible:!prevState.navBarVisible}))
  }
  render(){
    var contentclass = this.state.navBarVisible ? 'content open' : 'content';
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
          <h1>Menu bar content</h1>
        </NavBar>
        <div className={contentclass}
        >
        <button onClick={()=>(this.toggleNavBar())}/>
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

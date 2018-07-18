import React, { Children } from 'react'

import './nav.css'

class NavBar extends React.Component{
    constructor(props) {
        super(props);
        this.state = {isOpen: false};
      }
    render(){
        var navclass = this.props.isOpen ? 'nav open' : 'nav';
        var text = this.props.isOpen ? 'open' : 'closed';
        return (
            <div className={navclass}>
                {this.props.children}
            </div>
        )
    }
}

export default NavBar
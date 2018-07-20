import React from 'react'

import './nav.css'

class NavBar extends React.Component {
    constructor(props) {
        super(props);
        this.state = { isOpen: false };
    }
    render() {
        var navclass = this.props.isOpen ? 'nav open' : 'nav';
        return (
            <div className={navclass}>
                <div className="topNav">
                </div>
                <div className="bottomNav">
                    <h5>{"{"}</h5>
                    <h5>&nbsp;&nbsp;&nbsp;&nbsp;{"\"name\": \"Viren Sawant\","}</h5>
                </div>
            </div>
        )
    }
}

export default NavBar
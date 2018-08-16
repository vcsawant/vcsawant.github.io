import React from 'react'
import { Grid, Row, Col } from 'react-bootstrap'

const NavBar = props => (
  <Grid className={'affix'}>
    <Row className="show-grid" />
    <Row className="show-grid">
      <Col xs={12}>
        <h5>{'{'}</h5>
        <h5>
          &nbsp;&nbsp;&nbsp;&nbsp;
          {'"name": "Viren Sawant",'}
        </h5>
        <h5>
          &nbsp;&nbsp;&nbsp;&nbsp;
          {'"description": "about.html",'}
        </h5>
        <h5>
          &nbsp;&nbsp;&nbsp;&nbsp;
          {'"projects": "experience.html",'}
        </h5>
        <h5>
          &nbsp;&nbsp;&nbsp;&nbsp;
          {'"skills": "resume.html",'}
        </h5>
        <h5>{'}'}</h5>
      </Col>
    </Row>
  </Grid>
)

export default NavBar

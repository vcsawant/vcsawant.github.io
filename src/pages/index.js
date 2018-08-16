import React from 'react'
import Img from 'gatsby-image'
import Helmet from 'react-helmet'
import { Jumbotron, Grid, Row, Button } from 'react-bootstrap'

import 'bootstrap/dist/css/bootstrap.css'
import 'bootstrap/dist/css/bootstrap-theme.css'

import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFacebookSquare,
  faGithub,
  faInstagram,
  faLinkedin,
} from '@fortawesome/free-brands-svg-icons'
import { faAddressCard } from '@fortawesome/free-solid-svg-icons'

import pdf from '../assets/Resume.pdf'

library.add(faFacebookSquare, faGithub, faInstagram, faLinkedin, faAddressCard)

import './main.css'

const IndexPage = props => (
  <div className="container-fluid centered-content site-wrapper">
    <Helmet
      title={props.data.site.siteMetadata.title}
      meta={[
        { name: 'description', content: 'Sample' },
        { name: 'keywords', content: 'sample, something' },
      ]}
    />
    <Grid fluid>
      <Row>
        <Jumbotron className="main">
          <Img
            className="img-circle img-responsive"
            outerWrapperClassName="center-block icon-wrapper"
            title="headshot"
            alt="Viren headshot"
            sizes={props.data.imageSharp.sizes}
          />
          <h1>Viren Sawant</h1>
          <h3>Vanderbilt University Class of 2019</h3>
          <hr />
          <ul>
            <li>
              <a href={'https://www.facebook.com/vcsawant1'}>
                <FontAwesomeIcon icon={faFacebookSquare} size="3x" />
              </a>
            </li>
            <li>
              <a href={'https://www.instagram.com/viren.c.sawant/'}>
                <FontAwesomeIcon icon={faInstagram} size="3x" />
              </a>
            </li>
            <li>
              <a href={'https://github.com/vcsawant'}>
                <FontAwesomeIcon icon={faGithub} size="3x" />
              </a>
            </li>
            <li>
              <a href={'https://www.linkedin.com/in/viren-sawant-44b2b7161/'}>
                <FontAwesomeIcon icon={faLinkedin} size="3x" />
              </a>
            </li>
            <li>
              <a href={pdf}>
                <FontAwesomeIcon icon={faAddressCard} size="3x" />
              </a>
            </li>
          </ul>
        </Jumbotron>
      </Row>
    </Grid>
  </div>
)

export default IndexPage

export const query = graphql`
  query SiteTitleQuery {
    site {
      siteMetadata {
        title
      }
    }
    imageSharp(id: { regex: "/Viren/" }) {
      sizes {
        ...GatsbyImageSharpSizes_tracedSVG
      }
    }
  }
`

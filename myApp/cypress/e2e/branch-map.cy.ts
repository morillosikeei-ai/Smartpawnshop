/**
 * The branch map renders in a real browser.
 *
 * jsdom does no layout, so a unit test cannot tell a working map from a blank
 * box: both have zero height there. These checks run in Chrome, where a map
 * that fails to size itself, fails to initialise, or fails to fetch tiles is
 * visibly different from one that works.
 */
describe('Contact section branch map', () => {
  /**
   * Ionic scrolls inside ion-content, not on the window, and that scroller is
   * position: fixed. cy.scrollIntoView() moves the window and leaves the page
   * on the hero, so the element's own scrollIntoView is used instead: it walks
   * up to whichever ancestor actually scrolls.
   */
  const showContact = () => cy.get('#contact').then(($section) => $section[0].scrollIntoView());

  beforeEach(() => {
    cy.visit('/');
    showContact();
  });

  it('gives Leaflet a container with real height', () => {
    cy.get('.branch-map-surface')
      .should('be.visible')
      .and('have.class', 'leaflet-container')
      .then(($surface) => {
        expect($surface.height(), 'map height').to.be.greaterThan(200);
        expect($surface.width(), 'map width').to.be.greaterThan(200);
      });
  });

  it('paints OpenStreetMap tiles inside the card', () => {
    // A tile only gets leaflet-tile-loaded once its image has actually decoded,
    // so this passing means real map imagery is on screen.
    cy.get('.branch-map-surface img.leaflet-tile-loaded', { timeout: 20000 })
      .should('have.length.greaterThan', 0);

    cy.get('.leaflet-control-attribution').should('contain.text', 'OpenStreetMap');
  });

  it('shows the gold branch pin and the overlay label', () => {
    cy.get('.branch-map-surface img.leaflet-tile-loaded', { timeout: 20000 }).should('have.length.greaterThan', 0);
    // Leaflet fades tiles in, so let the fade finish before the picture.
    cy.wait(1200);
    cy.get('.branch-map-card').screenshot('branch-map-rendered');

    // The zoom buttons must not cover the branch label.
    cy.get('.leaflet-control-zoom').should('be.visible');

    cy.get('.branch-map-pin').should('be.visible');
    cy.get('.branch-map-badge').should('be.visible').and('contain.text', 'Pag-Asa Pawnshop – Kauswagan');
  });

  it('keeps the address and sends Get Directions to Google Maps', () => {
    cy.get('.branch-map-address').should('contain.text', 'Kauswagan, Cagayan de Oro City');
    cy.get('.branch-map-directions')
      .should('have.attr', 'target', '_blank')
      .and('have.attr', 'href')
      .then((href) => {
        expect(decodeURIComponent(String(href))).to.contain('google.com/maps/search/');
        expect(decodeURIComponent(String(href))).to.contain('Pag-Asa Pawnshop Kauswagan Cagayan de Oro City');
      });
  });

  it('renders at a phone width without overflowing the card', () => {
    cy.viewport(390, 844);
    showContact();

    cy.get('.branch-map-surface').should('be.visible').then(($surface) => {
      expect($surface.height(), 'map height on mobile').to.be.greaterThan(200);
    });

    cy.get('.branch-map-card').then(($card) => {
      cy.get('.branch-map-surface').then(($surface) => {
        expect($surface.width(), 'map fits the card').to.be.at.most($card.width() as number);
      });
    });
  });
});

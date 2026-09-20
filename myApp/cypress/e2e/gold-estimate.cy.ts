/**
 * The public "Get an Estimate" section on the landing page.
 *
 * Runs against the real API: POST /api/estimate needs no sign in and only
 * reads the latest gold price.
 */
describe('Landing page gold estimate', () => {
  // Reach the section the way a visitor does, through the nav link, and check
  // the anchor leaves the form clear of the fixed header. Cypress's own
  // actions scroll a field to the very top, under that header, so they run
  // with force once the real position has been checked.
  const showEstimate = () => {
    cy.contains('.desktop-nav a', 'Get an Estimate').click();
    cy.get('.landing-header').then(($header) => {
      cy.get('#estimate select').should(($select) => {
        expect($select[0].getBoundingClientRect().top).to.be.greaterThan($header[0].getBoundingClientRect().bottom);
      });
    });
  };

  it('shows an estimate, the gold price used, the disclaimer and the call to action', () => {
    cy.viewport(1280, 900);
    cy.visit('/');
    showEstimate();
    cy.contains('#estimate .estimate-field', 'Item Type').find('select').select('Necklace', { force: true });
    cy.contains('#estimate .estimate-field', 'Karat / Purity').find('select').select('21k', { force: true });
    cy.get('#estimate input[type="number"]').type('5', { force: true });
    cy.get('#estimate form').submit();

    cy.contains('#estimate .estimate-value', /Estimated value for your Gold Necklace: ₱[\d,]+\.\d{2}/).should('be.visible');
    cy.contains('#estimate', 'Gold price used').should('be.visible');
    cy.contains('#estimate', 'Final appraisal is done in-store by our staff.').should('be.visible');
    cy.get('#estimate ion-button[href="#contact"]').should('contain.text', 'Visit Our Shop');
    cy.get('#estimate').screenshot('gold-estimate-result');

    cy.contains('#estimate ion-button', 'Ask a Question').click({ force: true });
    cy.get('.faq-bubble').should('have.attr', 'aria-expanded', 'true');
  });

  it('switches the purity options to silver and estimates from the silver price', () => {
    cy.viewport(1280, 900);
    cy.visit('/');
    showEstimate();
    cy.contains('#estimate .estimate-material button', 'Silver').click({ force: true });
    cy.contains('#estimate .estimate-field', 'Karat / Purity').find('option').should('have.length', 2).first().should('have.text', '925 Sterling Silver');
    cy.contains('#estimate .estimate-field', 'Karat / Purity').find('select').select('999', { force: true });
    cy.get('#estimate input[type="number"]').type('10', { force: true });
    cy.get('#estimate form').submit();

    cy.contains('#estimate .estimate-value', /Estimated value for your Silver Ring: ₱[\d,]+\.\d{2}/).should('be.visible');
    cy.contains('#estimate', 'Silver price used').should('be.visible');
    cy.contains('#estimate', '999 Fine Silver').should('be.visible');
  });

  it('rejects a missing weight without calling the API', () => {
    cy.intercept('POST', '**/api/estimate').as('estimate');
    cy.viewport(1280, 900);
    cy.visit('/');
    showEstimate();
    cy.get('#estimate form').submit();
    cy.contains('#estimate .estimate-error', 'Enter the weight in grams').should('be.visible');
    cy.get('@estimate.all').should('have.length', 0);
  });
});

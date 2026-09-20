/**
 * The Sign In button shows a small spinner while the login request is out,
 * then returns to normal with the error when the sign in fails.
 */
describe('Login loading spinner', () => {
  it('shows while signing in and clears when the request ends', () => {
    cy.viewport(1280, 900);
    cy.intercept('POST', '**/api/login', { delay: 4000, statusCode: 422, body: { message: 'Invalid credentials.' } }).as('login');
    cy.visit('/');
    cy.contains('ion-button', 'Login').click();
    cy.get('#login-email input').type('someone@example.com', { force: true });
    cy.get('#login-password input').type('secret123', { force: true });
    cy.contains('ion-button', 'Sign In').click({ force: true });

    cy.contains('ion-button', 'Signing in...').should('have.class', 'is-busy');
    cy.get('.auth-btn-spinner').should('exist');

    cy.wait('@login');
    cy.contains('.auth-error', 'Invalid credentials.').should('exist');
    cy.get('.auth-btn-spinner').should('not.exist');
    cy.contains('ion-button', 'Sign In').should('exist');
  });
});

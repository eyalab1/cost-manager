/**
 * Express error handler that returns the project's required JSON shape.
 * @param {Error} err - The error thrown or forwarded by a handler.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The next middleware function.
 * @returns {Object} The Express JSON response describing the error.
 */
function errorHandler(err, req, res, next) {
  // Default to internal server error when no status was attached.
  const status = err.status || 500;

  // The project specification requires id and message on every error.
  return res.status(status).json({
    id: status,
    message: err.message || 'Internal Server Error',
  });
}

module.exports = errorHandler;

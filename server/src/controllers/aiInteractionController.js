const { validateAuctionId, validateAIQuestion, validateInteractionQuery } = require('../utils/aiValidation');
const { interactionToJSON } = require('../services/aiInteractionService');
const { createAIInteractionService } = require('../services/aiInteractionService');

function createAIInteractionController(dependencies) {
  const service = createAIInteractionService(dependencies);
  return {
    ask: async (req, res) => {
      const interaction = await service.ask(
        req.user.id,
        validateAuctionId(req.params.id),
        validateAIQuestion(req.body),
      );
      return res.status(202).json({
        message: 'AI interaction processed.',
        data: { interaction: interactionToJSON(interaction) },
      });
    },
    list: async (req, res) => {
      const result = await service.list(
        req.user.id,
        validateAuctionId(req.params.id),
        validateInteractionQuery(req.query),
      );
      return res.json({
        message: 'AI interactions retrieved successfully.',
        data: result.rows.map(interactionToJSON),
        meta: result.meta,
      });
    },
  };
}

module.exports = { createAIInteractionController };

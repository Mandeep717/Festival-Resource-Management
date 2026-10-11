import { FestivalMembershipModel } from "../Models/festival-membership.model.js";

const VALID_ROLES = ["attendee", "volunteer", "organizer"];

export const allowedRoles = (...roles) => {
  if (
    roles.length === 0 ||
    roles.some((role) => !VALID_ROLES.includes(role))
  ) {
    throw new Error("Invalid roles provided to allowedRoles middleware");
  }

  return async (req, res, next) => {
    try {
      // Check authentication
      if (!req.user?._id) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access",
        });
      }

      // Obtain the festival ID
      const festivalId =
        req.params.festivalId ||
        req.body.festivalId ||
        req.query.festivalId;

      if (!festivalId) {
        return res.status(400).json({
          success: false,
          message: "Festival ID is required",
        });
      }

      // Find the user's membership in this festival
      const membership = await FestivalMembershipModel.findOne({
        festivalId,
        userId: req.user._id,
      }).select("membershipType festivalId userId");

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this festival",
        });
      }

      // Check the user's festival-specific role
      if (!roles.includes(membership.membershipType)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden access",
        });
      }

      // Make membership information available to controllers
      req.festivalMembership = membership;
      req.festivalRole = membership.membershipType;
      req.festivalId = membership.festivalId;
      next();
    } catch (error) {
      next(error);
    }
  };
};
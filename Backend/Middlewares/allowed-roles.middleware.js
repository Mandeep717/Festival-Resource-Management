import { FestivalMembershipModel } from "../Models/festival-membership.model.js";

const VALID_ROLES = ["attendee", "volunteer", "organizer"];

export const allowedRoles = (...requestedRoles) => {
  const roles = requestedRoles.flat(Infinity);
  if (
    roles.length === 0 ||
    roles.some((role) => !VALID_ROLES.includes(role))
  ) {
    throw new Error("Invalid roles provided to allowedRoles middleware");
  }

  return async (req, res, next) => {
    try {
      // Obtain the festival ID
      const userId = req.user?.userId || req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized access",
        });
      }

      const festivalId =
        req.params.festivalId ||
        req.body?.festivalId ||
        req.query.festivalId;

      // Creation endpoints without an existing festival require the user to
      // already hold an active membership for the requested role.
      const membershipQuery = {
        userId,
        membershipType: { $in: roles },
        status: "active",
      };
      if (festivalId) membershipQuery.festivalId = festivalId;
      const membership = await FestivalMembershipModel.findOne(membershipQuery)
        .select("membershipType festivalId userId");

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this festival",
        });
      }

      // Check the user's festival-specific role
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

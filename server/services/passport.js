const passport = require("passport");
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const LocalStrategy = require("passport-local");
const User = require("../models/user");
const config = require("../config/keys");

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

const localOptions = { usernameField: "email", proxy: true };
const localLogin = new LocalStrategy(
  localOptions,
  async (email, password, done) => {
    try {
      const user = await User.findOne({ email: email });
      if (!user) {
        return done(null, false);
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return done(null, false);
      }

      // Modified condition to allow admin and superadmin users to log in regardless of agency status
      // Only regular users need to have agencies assigned
      if (
        user.agencies.length === 0 &&
        user.active &&
        user.email !== config.adminEmail &&
        user.role !== "Admin" &&
        user.role !== "superadmin"
      ) {
        return done(null, false);
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
);

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromHeader("authorization"),
  secretOrKey: config.secretJWT,
};

const jwtLogin = new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    const user = await User.findById(payload.sub);
    if (user) {
      done(null, user);
    } else {
      done(null, false);
    }
  } catch (err) {
    done(err, false);
  }
});

passport.use(jwtLogin);
passport.use(localLogin);

module.exports = passport;

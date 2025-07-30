import Stripe from "stripe";
import { Course } from "../models/course.model.js";
import { CoursePurchase } from "../models/coursePurchase.model.js";
import { Lecture } from "../models/lecture.model.js";
import { User } from "../models/user.model.js";
import nodemailer from "nodemailer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Helper to send purchase success email
const sendPurchaseSuccessEmail = async (to, courseTitle) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Use environment variable
      pass: process.env.EMAIL_PASS, // Use environment variable
    },
  });
const mailOptions = {
  from: `LMS <${process.env.EMAIL_USER}>`,
  to,
  subject: 'Your Course Purchase Was Successful!',
  text: `Thank you for your purchase!\n\nYou've successfully enrolled in:\nCourse: ${courseTitle}\n\nWe’re excited to have you on board. Let’s get started with your learning journey!`,
  html: `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color: #2e6c80;">Thank you for your purchase!</h2>
      <p>You’ve successfully enrolled in the following course:</p>
      <p><strong>Course:</strong> ${courseTitle}</p>
      <p>We’re excited to have you on board. Let’s get started with your learning journey!</p>
      <br>
      <p>— The LMS Team</p>
    </div>
  `
};
  await transporter.sendMail(mailOptions);
};

export const createCheckoutSession = async (req, res) => {
  try {
    const userId = req.id;
    const { courseId } = req.body;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found!" });

    // Create a new course purchase record
    const newPurchase = new CoursePurchase({
      courseId,
      userId,
      amount: course.coursePrice,
      status: "pending",
    });
    // Create a Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "inr",
            product_data: {
              name: course.courseTitle,
              images: [course.courseThumbnail],
            },
            unit_amount: course.coursePrice * 100, // Amount in paise (lowest denomination)
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `http://localhost:5173/course-progress/${courseId}`, // once payment successful redirect to course progress page
      cancel_url: `http://localhost:5173/course-detail/${courseId}`,
      metadata: {
        courseId: courseId,
        userId: userId,
      },
      shipping_address_collection: {
        allowed_countries: ["IN"], // Optionally restrict allowed countries
      },
    });

    if (!session.url) {
      return res
        .status(400)
        .json({ success: false, message: "Error while creating session" });
    }

    // Save the purchase record
    newPurchase.paymentId = session.id;
    newPurchase.status = "completed";
    await newPurchase.save();
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }
    const userCourse = await Course.findById(courseId);
    if (!userCourse) {
      return res.status(404).json({ message: "Course not found!" });
    }
    await sendPurchaseSuccessEmail(user.email, userCourse.courseTitle || "your course");


    return res.status(200).json({
      success: true,
      url: session.url, // Return the Stripe checkout URL
    });
  } catch (error) {
    console.log(error);
  }
};

export const stripeWebhook = async (req, res) => {
  let event;

  try {
    const payloadString = JSON.stringify(req.body, null, 2);
    const secret = process.env.WEBHOOK_ENDPOINT_SECRET;

    const header = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret,
    });

    event = stripe.webhooks.constructEvent(payloadString, header, secret);
    console.log("[STRIPE WEBHOOK] Event received:", event.type);
    console.log("[STRIPE WEBHOOK] Event data:", JSON.stringify(event.data, null, 2));
  } catch (error) {
    console.error("Webhook error:", error.message);
    return res.status(400).send(`Webhook error: ${error.message}`);
  }

  // Handle the checkout session completed event
  if (event.type === "checkout.session.completed") {
    console.log("[STRIPE WEBHOOK] checkout.session.completed called");
    try {
      const session = event.data.object;
      console.log("[STRIPE WEBHOOK] Session object:", JSON.stringify(session, null, 2));
      const purchase = await CoursePurchase.findOne({
        paymentId: session.id,
      }).populate({ path: "courseId" });

      if (!purchase) {
        console.log("[STRIPE WEBHOOK] Purchase not found for paymentId:", session.id);
        return res.status(404).json({ message: "Purchase not found" });
      }

      if (session.amount_total) {
        purchase.amount = session.amount_total / 100;
      }
      purchase.status = "completed";

      // Make all lectures visible by setting `isPreviewFree` to true
      if (purchase.courseId && purchase.courseId.lectures.length > 0) {
        await Lecture.updateMany(
          { _id: { $in: purchase.courseId.lectures } },
          { $set: { isPreviewFree: true } }
        );
      }

      await purchase.save();
      console.log("[STRIPE WEBHOOK] Purchase marked as completed for:", purchase._id);

      // Update user's enrolledCourses
      const user = await User.findByIdAndUpdate(
        purchase.userId,
        { $addToSet: { enrolledCourses: purchase.courseId._id } },
        { new: true }
      );
      // Send email to user (if user found and has email)
      if (user && user.email) {
        try {
          await sendPurchaseSuccessEmail(user.email, purchase.courseId.courseTitle || "your course");
          console.log(`[EMAIL] Sent purchase success email to ${user.email}`);
        } catch (emailErr) {
          console.error("[EMAIL] Failed to send purchase email:", emailErr);
        }
      }

      // Update course to add user ID to enrolledStudents
      await Course.findByIdAndUpdate(
        purchase.courseId._id,
        { $addToSet: { enrolledStudents: purchase.userId } }, // Add user ID to enrolledStudents
        { new: true }
      );
    } catch (error) {
      console.error("Error handling event:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
  res.status(200).send();
};
export const getCourseDetailWithPurchaseStatus = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.id;

    const course = await Course.findById(courseId)
      .populate({ path: "creator" })
      .populate({ path: "lectures" });

    const purchased = await CoursePurchase.findOne({ userId, courseId });
    console.log(purchased);

    if (!course) {
      return res.status(404).json({ message: "course not found!" });
    }

    return res.status(200).json({
      course,
      purchased: !!purchased, // true if purchased, false otherwise
    });
  } catch (error) {
    console.log(error);
  }
};

export const getAllPurchasedCourse = async (_, res) => {
  try {
    const purchasedCourse = await CoursePurchase.find({
      status: "completed",
    }).populate("courseId");
    if (!purchasedCourse) {
      return res.status(404).json({
        purchasedCourse: [],
      });
    }
    return res.status(200).json({
      purchasedCourse,
    });
  } catch (error) {
    console.log(error);
  }
};

// ADMIN: Mark all pending purchases as completed (for testing/demo)
export const markAllPurchasesCompleted = async (req, res) => {
  try {
    const result = await CoursePurchase.updateMany(
      { status: "pending" },
      { $set: { status: "completed" } }
    );
    return res.status(200).json({
      message: `Marked ${result.modifiedCount} purchases as completed.`,
      result,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Failed to update purchases" });
  }
};

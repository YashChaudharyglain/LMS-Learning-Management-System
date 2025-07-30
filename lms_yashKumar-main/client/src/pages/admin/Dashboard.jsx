import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetPurchasedCoursesQuery } from "@/features/api/purchaseApi";
import { useGetPublishedCourseQuery } from "@/features/api/courseApi";
import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, DollarSign, History } from "lucide-react";
import { toast } from "sonner";

const Dashboard = () => {

  const {data, isSuccess, isError, isLoading} = useGetPurchasedCoursesQuery(undefined, { pollingInterval: 1000 });
  const { data: publishedData, isLoading: publishedLoading, isError: publishedError } = useGetPublishedCourseQuery();

  if(isLoading) return <h1>Loading...</h1>
  if(isError) return <h1 className="text-red-500">Failed to get purchased course</h1>

  //
  const {purchasedCourse} = data || [];
  const publishedCourses = publishedData?.courses || [];
  const publishedCourseIds = new Set(publishedCourses.map(c => c._id));

  // Split purchases into current (published) and previous (unpublished/deleted)
  const currentPurchases = purchasedCourse.filter(pc => pc.courseId && publishedCourseIds.has(pc.courseId._id));
  const previousPurchases = purchasedCourse.filter(pc => !pc.courseId || !publishedCourseIds.has(pc.courseId._id));

  // Helper for sales/revenue graph data
  const getSalesGraphData = (arr, allowMissingCourseId = false) => arr.filter(course => (allowMissingCourseId || course.courseId) && course.createdAt)
    .reduce((acc, course) => {
      const date = new Date(course.createdAt).toLocaleDateString();
      const found = acc.find(item => item.date === date);
      if (found) { found.count += 1; } else { acc.push({ date, count: 1 }); }
      return acc;
    }, []);
  const getRevenueGraphData = (arr, allowMissingCourseId = false) => arr.filter(course => (allowMissingCourseId || course.courseId) && course.createdAt && course.amount !== undefined)
    .reduce((acc, course) => {
      const date = new Date(course.createdAt).toLocaleDateString();
      const found = acc.find(item => item.date === date);
      if (found) { found.revenue += course.amount || 0; } else { acc.push({ date, revenue: course.amount || 0 }); }
      return acc;
    }, []);

  if (publishedLoading) return <h1>Loading...</h1>;
  if (publishedError) return <h1 className="text-red-500">Failed to get published courses</h1>;

  // Handler to mark all purchases as completed (for local testing)
  const handleMarkAllCompleted = async () => {
    try {
      const res = await fetch("http://localhost:8080/api/v1/purchase/admin/mark-all-completed", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "All purchases marked as completed.");
      } else {
        toast.error(data.message || "Failed to mark purchases as completed.");
      }
    } catch (err) {
      toast.error("Failed to mark purchases as completed.");
    }
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Current (Published) Courses Cards */}
      <div>
        <h2 className="text-2xl font-extrabold flex items-center gap-2 mb-4 text-green-700">
          Current (Published) Courses
        </h2>
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ">
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-green-900">Total Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-700">{currentPurchases.length}</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-green-900">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-700">₹{currentPurchases.reduce((acc, el) => acc + (el.amount || 0), 0)}</p>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Previous (Unpublished/Deleted) Courses Cards */}
      <div>
        <h2 className="text-2xl font-extrabold flex items-center gap-2 mb-4 mt-6 text-blue-700">
          Previous (Unpublished) Courses
        </h2>
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ">
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-blue-900">Total Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-700">{previousPurchases.length}</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-blue-900">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-700">₹{previousPurchases.reduce((acc, el) => acc + (el.amount || 0), 0)}</p>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Both Graphs Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
        {/* Current Graphs */}
        <div>
          <h3 className="text-lg font-bold text-green-700 mb-2 flex items-center gap-2">
            <TrendingUp className="text-green-600" size={20} /> Current Courses: Sales Over Time
          </h3>
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 mb-6">
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={getSalesGraphData(currentPurchases)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#16a34a" angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#16a34a" allowDecimals={false} />
                  <Tooltip formatter={value => value} labelStyle={{ color: '#16a34a' }} contentStyle={{ background: '#f0fdf4', borderColor: '#16a34a' }} />
                  <Line type="monotone" dataKey="count" stroke="#16a34a" strokeWidth={3} dot={{ stroke: '#16a34a', strokeWidth: 2 }} activeDot={{ r: 8, fill: '#22c55e', stroke: '#16a34a', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <h3 className="text-lg font-bold text-green-700 mb-2 flex items-center gap-2">
            <span className="text-green-600 text-xl font-bold">₹</span> Current Courses: Revenue Over Time
          </h3>
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={getRevenueGraphData(currentPurchases)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#16a34a" angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#16a34a" tickFormatter={v => `₹${v}`} />
                  <Tooltip formatter={value => `₹${value}`} labelStyle={{ color: '#16a34a' }} contentStyle={{ background: '#f0fdf4', borderColor: '#16a34a' }} />
                  <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={3} dot={{ stroke: "#16a34a", strokeWidth: 2 }} activeDot={{ r: 8, fill: '#22c55e', stroke: '#16a34a', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        {/* Previous Graphs */}
        <div>
          <h3 className="text-lg font-bold text-blue-700 mb-2 flex items-center gap-2">
            <TrendingUp className="text-blue-600" size={20} /> Previous Courses: Sales Over Time
          </h3>
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 mb-6">
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={getSalesGraphData(previousPurchases, true)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#2563eb" angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#2563eb" allowDecimals={false} />
                  <Tooltip formatter={value => value} labelStyle={{ color: '#2563eb' }} contentStyle={{ background: '#eff6ff', borderColor: '#2563eb' }} />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} dot={{ stroke: '#2563eb', strokeWidth: 2 }} activeDot={{ r: 8, fill: '#3b82f6', stroke: '#2563eb', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <h3 className="text-lg font-bold text-blue-700 mb-2 flex items-center gap-2">
            <span className="text-blue-600 text-xl font-bold">₹</span> Previous Courses: Revenue Over Time
          </h3>
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={getRevenueGraphData(previousPurchases, true)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#2563eb" angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#2563eb" tickFormatter={v => `₹${v}`} />
                  <Tooltip formatter={value => `₹${value}`} labelStyle={{ color: '#2563eb' }} contentStyle={{ background: '#eff6ff', borderColor: '#2563eb' }} />
                  <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} dot={{ stroke: "#2563eb", strokeWidth: 2 }} activeDot={{ r: 8, fill: '#3b82f6', stroke: '#2563eb', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
